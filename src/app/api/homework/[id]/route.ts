import { NextResponse } from "next/server";
import {
  homeworkDetail,
  homeworkError,
  requestBody,
} from "@/lib/homework/server";
import { saveHomework } from "@/lib/homework/operations";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  try {
    return NextResponse.json(
      await homeworkDetail(
        (await params).id,
        new URL(request.url).searchParams.get("studentId") ?? undefined,
      ),
    );
  } catch (error) {
    return homeworkError(error);
  }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    return NextResponse.json(
      await saveHomework(await requestBody(request), (await params).id),
    );
  } catch (error) {
    return homeworkError(error);
  }
}
