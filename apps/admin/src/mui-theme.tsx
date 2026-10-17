import {
  StyledEngineProvider,
  ThemeProvider,
  createTheme
} from "@mui/material/styles";
import { zhCN } from "@mui/material/locale";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { zhCN as pickerZhCN } from "@mui/x-date-pickers/locales";
import type { PropsWithChildren } from "react";
import "dayjs/locale/zh-cn";

export const muiTheme = createTheme(
  {
    palette: {
      primary: { main: "#2053FF" },
      background: { default: "#f5f6fa" }
    },
    typography: {
      fontFamily: "var(--tsz-font-text)",
      fontSize: 14,
      button: { textTransform: "none" }
    },
    shape: { borderRadius: 8 },
    components: {
      MuiButton: { defaultProps: { size: "small" } },
      MuiTextField: { defaultProps: { size: "small" } },
      MuiFormControl: { defaultProps: { size: "small" } },
      MuiTable: { defaultProps: { size: "small" } },
      MuiChip: { defaultProps: { size: "small" } }
    }
  },
  zhCN
);

export function AdminThemeProvider({ children }: PropsWithChildren) {
  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={muiTheme}>
        <LocalizationProvider
          dateAdapter={AdapterDayjs}
          adapterLocale="zh-cn"
          localeText={
            pickerZhCN.components.MuiLocalizationProvider.defaultProps
              .localeText
          }
        >
          {children}
        </LocalizationProvider>
      </ThemeProvider>
    </StyledEngineProvider>
  );
}
