import Close from "@mui/icons-material/Close";
import {
  Box,
  ButtonBase,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton
} from "@mui/material";
import { useState } from "react";
export function ImagePreview({
  src,
  alt,
  width,
  height
}: {
  src: string;
  alt: string;
  width: number;
  height?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ButtonBase aria-label={`预览${alt}`} onClick={() => setOpen(true)}>
        <Box
          component="img"
          src={src}
          alt={alt}
          sx={{ width, height, objectFit: "contain", maxWidth: "100%" }}
        />
      </ButtonBase>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="lg"
        aria-label={alt}
      >
        <DialogTitle>
          {alt}
          <IconButton
            aria-label="关闭预览"
            onClick={() => setOpen(false)}
            sx={{ float: "right" }}
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box component="img" src={src} alt={alt} sx={{ maxWidth: "100%" }} />
        </DialogContent>
      </Dialog>
    </>
  );
}
