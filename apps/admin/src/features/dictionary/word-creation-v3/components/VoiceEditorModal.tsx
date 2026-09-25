import { Modal, type ModalProps } from "antd";
import { useRef, useState, type PointerEvent } from "react";

export function VoiceEditorModal({ title, ...props }: ModalProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  }>(null);
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const next = {
      x: drag.current.left + event.clientX - drag.current.x,
      y: drag.current.top + event.clientY - drag.current.y
    };
    const rect = event.currentTarget.getBoundingClientRect();
    next.x = Math.min(
      window.innerWidth - rect.right + position.x,
      Math.max(position.x - rect.left, next.x)
    );
    next.y = Math.min(
      window.innerHeight - rect.bottom + position.y,
      Math.max(position.y - rect.top, next.y)
    );
    setPosition(next);
  };
  return (
    <Modal
      width={960}
      destroyOnHidden
      mask={{ closable: false }}
      styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}
      {...props}
      title={
        <div
          style={{
            cursor: "move",
            touchAction: "none",
            paddingRight: 32,
            userSelect: "none"
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              left: position.x,
              top: position.y
            };
          }}
          onPointerMove={move}
          onPointerUp={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        >
          {title}
        </div>
      }
      afterClose={() => {
        setPosition({ x: 0, y: 0 });
        props.afterClose?.();
      }}
      modalRender={(node) => (
        <div
          style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
        >
          {node}
        </div>
      )}
    />
  );
}
