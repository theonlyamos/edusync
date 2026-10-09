import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireHomework,
  homeworkError,
  HomeworkError,
  mutate,
  requestBody,
} from "@/lib/homework/server";
import { validateFile } from "@/lib/homework/domain";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  try {
    const { id } = await params,
      { db, user } = await requireHomework(id),
      attachmentId = z
        .string()
        .uuid()
        .parse(new URL(request.url).searchParams.get("attachmentId"));
    let query = db
      .from("homework_attachments")
      .select("*")
      .eq("id", attachmentId)
      .eq("homework_id", id);
    if (user.role === "student") query = query.eq("student_id", user.id);
    const { data: file, error } = await query.maybeSingle();
    if (error) throw error;
    if (!file) throw new HomeworkError(404, "Attachment not found");
    const { data, error: signError } = await db.storage
      .from("homework-files")
      .createSignedUrl(file.storage_path, 60, {
        download: file.mime_type.includes("wordprocessing")
          ? file.filename
          : false,
      });
    if (signError) throw signError;
    return NextResponse.json(
      {
        url: data.signedUrl,
        filename: file.filename,
        mimeType: file.mime_type,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return homeworkError(error);
  }
}
export async function POST(request: Request, { params }: Context) {
  let cleanup: (() => Promise<void>) | undefined;
  try {
    const { id } = await params,
      { db, user } = await requireHomework(id);
    if (user.role !== "student")
      throw new HomeworkError(403, "Only the assigned student can upload work");
    const reader = request.body?.getReader();
    if (!reader) throw new HomeworkError(400, "Choose a file");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 11 * 1024 * 1024) {
        await reader.cancel();
        throw new HomeworkError(413, "Upload exceeds the 10 MB file limit");
      }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
    const attemptId = z.string().uuid().parse(form.get("attemptId")),
      questionId = z.string().min(1).max(80).parse(form.get("questionId")),
      file = form.get("file");
    if (!(file instanceof File)) throw new HomeworkError(400, "Choose a file");
    let extension: string;
    try {
      extension = validateFile(file.name, file.type, file.size);
    } catch (error) {
      throw new HomeworkError(400, (error as Error).message);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const valid =
      extension === "pdf"
        ? Buffer.from(bytes.slice(0, 5)).toString() === "%PDF-"
        : extension === "png"
          ? [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
          : extension === "docx"
            ? bytes[0] === 80 &&
              bytes[1] === 75 &&
              bytes[2] === 3 &&
              bytes[3] === 4
            : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!valid)
      throw new HomeworkError(
        400,
        "The file content does not match its declared format",
      );
    const { data: attempt, error: attemptError } = await db
      .from("homework_attempts")
      .select("id,submitted_at")
      .eq("id", attemptId)
      .eq("homework_id", id)
      .eq("student_id", user.id)
      .maybeSingle();
    if (attemptError) throw attemptError;
    if (!attempt || attempt.submitted_at)
      throw new HomeworkError(
        409,
        "Start an editable homework attempt before uploading",
      );
    const path = `${id}/${user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await db.storage
      .from("homework-files")
      .upload(path, bytes, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    cleanup = async () => {
      await db.storage.from("homework-files").remove([path]);
    };
    const attached = await mutate(db, user.id, id, "attach", {
      attemptId,
      questionId,
      filename: file.name.slice(0, 200),
      mimeType: file.type,
      byteSize: file.size,
      path,
    });
    cleanup = undefined;
    return NextResponse.json(attached, { status: 201 });
  } catch (error) {
    if (cleanup) await cleanup().catch(() => {});
    return homeworkError(error);
  }
}
export async function DELETE(request: Request, { params }: Context) {
  try {
    const { id } = await params,
      { db, user } = await requireHomework(id);
    if (user.role !== "student")
      throw new HomeworkError(
        403,
        "Only the student can remove an unsubmitted attachment",
      );
    const input = z
      .object({ attemptId: z.string().uuid(), attachmentId: z.string().uuid() })
      .parse(await requestBody(request));
    const result = await mutate(db, user.id, id, "remove_attachment", input);
    await db.storage.from("homework-files").remove([result.path]);
    return NextResponse.json(result.attempt);
  } catch (error) {
    return homeworkError(error);
  }
}
