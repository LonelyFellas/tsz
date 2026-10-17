import { ListFilterBar } from "@/components/ListFilterBar";
import Refresh from "@mui/icons-material/Refresh";
import Search from "@mui/icons-material/Search";
import { Button, Paper, TextField } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { Controller, useForm } from "react-hook-form";
import type { UserFilterValues } from "./listQuery";

export function UserFilters({
  onSearch,
  onReset
}: {
  onSearch: (values: UserFilterValues) => void;
  onReset: () => void;
}) {
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<UserFilterValues>({
    defaultValues: { q: "", registeredDate: null }
  });
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <ListFilterBar onSubmit={handleSubmit(onSearch)}>
        <TextField
          fullWidth
          label="关键词"
          placeholder="手机号 / 邮箱 / 用户昵称"
          {...register("q")}
        />
        <Controller
          name="registeredDate"
          control={control}
          rules={{
            validate: (value) => !value || value.isValid() || "请输入有效日期"
          }}
          render={({ field }) => (
            <DatePicker
              label="注册时间"
              format="YYYY-MM-DD"
              value={field.value}
              onChange={field.onChange}
              slotProps={{
                field: { clearable: true },
                textField: {
                  size: "small",
                  onBlur: field.onBlur,
                  inputRef: field.ref,
                  error: !!errors.registeredDate,
                  helperText: errors.registeredDate?.message
                }
              }}
            />
          )}
        />
        <Button type="submit" variant="contained" startIcon={<Search />}>
          搜索
        </Button>
        <Button
          startIcon={<Refresh />}
          onClick={() => {
            reset();
            onReset();
          }}
        >
          重置
        </Button>
      </ListFilterBar>
    </Paper>
  );
}
