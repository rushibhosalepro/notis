import ChatComponent from "@/components/ChatComponent";
import ChatPage from "../../../../components/ChatPage";
import { userId } from "../../../../lib/utils";

interface Props {
  params: Promise<{ caseId: string }>;
}

const page = async ({ params }: Props) => {
  const { caseId } = await params;

  // return <ChatComponent caseId={caseId} />;
  return <ChatPage caseId={caseId} userId={userId} />;
};

export default page;
