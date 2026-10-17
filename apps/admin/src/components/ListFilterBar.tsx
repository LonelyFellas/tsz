import { Stack } from "@mui/material";
import type { StackProps } from "@mui/material";
import type { FormEventHandler, ReactNode } from "react";

export function ListFilterBar({
  children,
  onSubmit,
  justifyContent
}: {
  children: ReactNode;
  onSubmit?: FormEventHandler;
  justifyContent?: StackProps["justifyContent"];
}) {
  return (
    <Stack
      className="list-filter-bar"
      component={onSubmit ? "form" : "div"}
      onSubmit={onSubmit}
      direction="row"
      useFlexGap
      flexWrap="wrap"
      spacing={1}
      alignItems="start"
      justifyContent={justifyContent}
      sx={{
        minWidth: 0,
        maxWidth: "100%",
        "& > .MuiFormControl-root, & > .MuiAutocomplete-root": {
          width: { xs: "calc(50% - 4px)", sm: 220 },
          minWidth: 0
        },
        "& > .MuiFormControl-fullWidth, & > .MuiAutocomplete-fullWidth": {
          width: { xs: "100%", sm: 220 }
        },
        "& > .MuiAutocomplete-root .MuiFormControl-root": { width: "100%" },
        "& > .list-filter-dates": { display: "contents" },
        "& .MuiPickersTextField-root": {
          width: { xs: "100%", sm: 220 },
          minWidth: 0
        },
        "& .list-filter-dates-with-time .MuiPickersTextField-root": {
          width: { xs: "100%", sm: 280 }
        },
        "& .MuiButton-root": { height: 40 }
      }}
    >
      {children}
    </Stack>
  );
}
