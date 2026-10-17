import InfoOutlined from "@mui/icons-material/InfoOutlined";
import { Box, TextField, Tooltip } from "@mui/material";
import { Controller, useFormContext } from "react-hook-form";
import type { ReactNode } from "react";

export function LabelWithHint({
  label,
  hint
}: {
  label: string;
  hint: ReactNode;
}) {
  return (
    <span>
      {label}
      <Tooltip describeChild title={hint}>
        <InfoOutlined
          aria-hidden
          sx={{
            ml: 0.5,
            fontSize: 14,
            color: "text.secondary",
            verticalAlign: "middle"
          }}
        />
      </Tooltip>
    </span>
  );
}
export interface PartOfSpeechSharedPlaceholders {
  name_zh: string;
  short_name_zh: string;
  name_en: string;
  abbreviation: string;
  full_name_en: string;
}
export interface PartFieldValues extends PartOfSpeechSharedPlaceholders {
  sort_order: number;
}
const FIELD_LABELS = {
  name_zh: "正式中文",
  short_name_zh: "简洁显示",
  name_en: "正式英文",
  abbreviation: "英文缩写",
  full_name_en: "英文全称"
} as const;
const FIELD_REQUIRED = {
  name_zh: "请输入中文名称",
  short_name_zh: "请输入简洁显示名称",
  name_en: "请输入英文名称",
  abbreviation: "请输入英文缩写",
  full_name_en: "请输入英文全称"
};
const FIELD_MAX = {
  name_zh: 64,
  short_name_zh: 16,
  name_en: 64,
  abbreviation: 16,
  full_name_en: 200
};
const FIELD_LENGTH_LABEL = {
  name_zh: "中文名称",
  short_name_zh: "简洁显示",
  name_en: "英文名称",
  abbreviation: "英文缩写",
  full_name_en: "英文全称"
};
export function PartOfSpeechSharedFields({
  placeholders,
  disabled = false
}: {
  placeholders: PartOfSpeechSharedPlaceholders;
  disabled?: boolean;
}) {
  const {
    register,
    control,
    formState: { errors }
  } = useFormContext<PartFieldValues>();
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "repeat(2,minmax(0,1fr))" },
        gap: 2
      }}
    >
      {(Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[]).map(
        (name) => (
          <TextField
            disabled={disabled}
            key={name}
            label={FIELD_LABELS[name]}
            placeholder={placeholders[name]}
            error={!!errors[name]}
            helperText={errors[name]?.message}
            {...register(name, {
              validate: (value) =>
                !value?.trim()
                  ? FIELD_REQUIRED[name]
                  : value.length > FIELD_MAX[name]
                    ? `${FIELD_LENGTH_LABEL[name]}不能超过 ${FIELD_MAX[name]} 个字符`
                    : name === "full_name_en" && !/[A-Za-z]/.test(value)
                      ? "英文全称需包含英文字母"
                      : true
            })}
          />
        )
      )}
      <Controller
        name="sort_order"
        control={control}
        rules={{
          required: "请输入序号",
          validate: (value) =>
            (Number.isInteger(value) &&
              value >= -2147483648 &&
              value <= 2147483647) ||
            "序号需为 32 位有符号整数"
        }}
        render={({ field, fieldState }) => (
          <TextField
            disabled={disabled}
            label={
              <LabelWithHint
                label="序号"
                hint="数字越小越靠前，允许与别的行相同"
              />
            }
            placeholder="数字越小越靠前，允许与别的行相同"
            type="number"
            value={field.value ?? ""}
            inputRef={field.ref}
            onBlur={field.onBlur}
            onChange={(event) =>
              field.onChange(
                event.target.value === ""
                  ? undefined
                  : Number(event.target.value)
              )
            }
            error={!!fieldState.error}
            helperText={fieldState.error?.message}
            slotProps={{
              htmlInput: { min: -2147483648, max: 2147483647, step: 1 }
            }}
          />
        )}
      />
    </Box>
  );
}

/** 回填只取可编辑字段，不把配置 ID、编码和审计字段提交回服务端。 */
export function partFieldValues(value: PartFieldValues): PartFieldValues {
  const {
    name_zh,
    short_name_zh,
    name_en,
    abbreviation,
    full_name_en,
    sort_order
  } = value;
  return {
    name_zh,
    short_name_zh,
    name_en,
    abbreviation,
    full_name_en,
    sort_order
  };
}
