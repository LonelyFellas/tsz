import { Tooltip, Typography } from "@mui/material";
import { useState } from "react";
export function FullNameEnCell({ value }: { value: string }) {
  const [truncated, setTruncated] = useState(false);
  return (
    <Tooltip describeChild title={truncated ? value : ""}>
      <Typography
        onMouseEnter={(event) =>
          setTruncated(
            event.currentTarget.scrollHeight > event.currentTarget.clientHeight
          )
        }
        sx={{
          overflowWrap: "anywhere",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden"
        }}
      >
        {value}
      </Typography>
    </Tooltip>
  );
}
