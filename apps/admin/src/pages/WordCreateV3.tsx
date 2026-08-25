import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  createV3WordRequests,
  type V3WordRequests
} from "@/features/dictionary/word-creation-v3/api";
import { V3CreateEntryStep } from "@/features/dictionary/word-creation-v3/V3CreateEntryStep";

export function WordCreateV3Page({
  requests: suppliedRequests
}: {
  requests?: V3WordRequests;
} = {}) {
  const navigate = useNavigate();
  const requests = useMemo(
    () => suppliedRequests ?? createV3WordRequests(),
    [suppliedRequests]
  );
  return (
    <V3CreateEntryStep
      requests={requests}
      onCreated={(word) =>
        navigate(`/words/${word.id}/v3/wizard/forms`, { replace: true })
      }
    />
  );
}
