import { NextResponse } from "next/server";
import { homeworkError, requestBody } from "@/lib/homework/server";
import { homeworkAction } from "@/lib/homework/operations";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await homeworkAction((await params).id, await requestBody(request)),
    );
  } catch (error) {
    return homeworkError(error);
  }
}
