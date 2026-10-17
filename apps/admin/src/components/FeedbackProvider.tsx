import { Alert, Snackbar } from "@mui/material";
import type { AlertColor } from "@mui/material";
import { createContext, useCallback, useContext, useState } from "react";
import type { PropsWithChildren } from "react";

type Feedback = (text: string, severity?: AlertColor) => void;
const FeedbackContext = createContext<Feedback | null>(null);

export function FeedbackProvider({ children }: PropsWithChildren) {
  const [notice, setNotice] = useState<{
    text: string;
    severity: AlertColor;
    key: number;
  }>();
  const notify: Feedback = useCallback(
    (text, severity = "info") => setNotice({ text, severity, key: Date.now() }),
    []
  );
  return (
    <FeedbackContext.Provider value={notify}>
      {children}
      <Snackbar
        key={notice?.key}
        open={!!notice}
        autoHideDuration={6000}
        onClose={(_, reason) => {
          if (reason !== "clickaway") setNotice(undefined);
        }}
      >
        <Alert
          severity={notice?.severity}
          onClose={() => setNotice(undefined)}
          variant="filled"
        >
          {notice?.text}
        </Alert>
      </Snackbar>
    </FeedbackContext.Provider>
  );
}
export function useFeedback() {
  const feedback = useContext(FeedbackContext);
  if (!feedback) throw new Error("缺少 FeedbackProvider");
  return feedback;
}
