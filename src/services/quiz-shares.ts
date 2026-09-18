"use client";

import type { ApiResult } from "@/services/history";

export async function createQuizShare(
  idToken: string,
  studySetId: string,
): Promise<ApiResult<{ token: string }>> {
  try {
    const response = await fetch("/api/quiz-shares", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ studySetId }),
    });
    const body = (await response.json()) as { token?: string; error?: { code?: string; message?: string } };
    if (!response.ok || !body.token) {
      return {
        ok: false,
        code: body.error?.code ?? "unknown",
        message: body.error?.message ?? "Linku nuk u krijua.",
      };
    }
    return { ok: true, data: { token: body.token } };
  } catch {
    return {
      ok: false,
      code: "network_error",
      message: "Nuk mund të krijohej linku.",
    };
  }
}