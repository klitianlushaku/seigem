import { notFound } from "next/navigation";

import { PublicQuiz } from "@/components/study/public-quiz";
import { getPublicQuizShare } from "@/server/services/quiz-shares";

export default async function SharedQuizPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const share = await getPublicQuizShare(token);
  if (!share) notFound();

  return <PublicQuiz title={share.title} questions={share.questions} />;
}