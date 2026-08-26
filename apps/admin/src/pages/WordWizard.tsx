import { Flex } from "antd";
import { useLocation } from "react-router-dom";
import {
  CreationSourceNotice,
  creationSourceFromState
} from "@/features/dictionary/word-creation/CreationSourceNotice";
import { WordCreationWizard } from "@/features/dictionary/word-creation/WordCreationWizard";

// V2 草稿恢复及已发布只读预览入口；向导自行读取 :wordId / :step 并做路由守卫。
export function WordWizardPage() {
  const location = useLocation();
  return (
    <Flex vertical gap="middle">
      <CreationSourceNotice source={creationSourceFromState(location.state)} />
      <WordCreationWizard mode="resume" />
    </Flex>
  );
}
