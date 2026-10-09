import { NextResponse } from "next/server";
import { z } from "zod";
import { homeworkError } from "@/lib/homework/server";
import { listSources, sourceForHomework } from "@/lib/homework/sources";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url),
      id = url.searchParams.get("lessonId"),
      publication = url.searchParams.get("publicationId");
    if (id) z.string().uuid().parse(id);
    if (publication) z.string().uuid().parse(publication);
    return NextResponse.json(
      id
        ? await sourceForHomework(id, publication ?? undefined)
        : await listSources(),
    );
  } catch (error) {
    return homeworkError(error);
  }
}
