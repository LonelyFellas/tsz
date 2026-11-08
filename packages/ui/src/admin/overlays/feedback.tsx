import { useInterfaceTranslation } from "@tsz/shared/i18n/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Key,
  type ReactNode
} from "react";
import { createPortal, flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Modal, type ModalProps } from "./dialog";

type NoticeKind = "success" | "error" | "warning" | "info" | "loading";
interface NoticeConfig {
  key?: Key;
  type?: NoticeKind;
  title?: ReactNode;
  description?: ReactNode;
  content?: ReactNode;
  actions?: ReactNode;
  duration?: number;
  onClose?: () => void;
}
interface Notice extends NoticeConfig {
  id: Key;
  notification: boolean;
}
type MessageApi = Record<
  NoticeKind,
  (content: ReactNode, duration?: number) => void
> & {
  open: (config: NoticeConfig) => void;
  destroy: (key?: Key) => void;
};
interface Confirmation extends Omit<
  ModalProps,
  "onOk" | "onCancel" | "content"
> {
  content?: ReactNode;
  icon?: ReactNode;
  autoFocusButton?: "cancel" | "ok" | null;
  onOk?: (close: () => void) => unknown;
  onCancel?: () => void;
}
interface ConfirmationHandle {
  destroy: () => void;
  update: (changes: Partial<Confirmation>) => void;
}
interface Feedback {
  message: MessageApi;
  notification: {
    success: (config: NoticeConfig) => void;
    destroy: (key?: Key) => void;
  };
  modal: {
    confirm: (config: Confirmation) => ConfirmationHandle;
    error: (config: Confirmation) => ConfirmationHandle;
  };
}
type DialogState = {
  id: number;
  open: boolean;
  info: boolean;
  config: Confirmation;
};
const Context = createContext<Feedback | null>(null);
const mounted: Feedback[] = [];
let sequence = 0;

function MessageNotice({
  notice,
  onClose
}: {
  notice: Notice;
  onClose: () => void;
}) {
  const { t } = useInterfaceTranslation();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const duration = notice.duration ?? (notice.notification ? 4.5 : 3);
    if (duration <= 0) return;
    const timer = setTimeout(() => onCloseRef.current(), duration * 1000);
    return () => clearTimeout(timer);
  }, [notice]);
  return (
    <div
      role={notice.type === "error" ? "alert" : "status"}
      className={
        notice.notification ? "ui-notification-notice" : "ui-message-notice"
      }
      data-type={notice.type}
    >
      <div className="ui-feedback-content">
        {notice.title && <strong>{notice.title}</strong>}
        {notice.description ?? notice.content}
        {notice.actions}
      </div>
      {notice.notification && (
        <button
          type="button"
          onClick={onClose}
          className="ui-feedback-close"
          aria-label={t("controls.closeNotification")}
        >
          ×
        </button>
      )}
    </div>
  );
}

function ConfirmationDialog({
  state,
  close,
  remove
}: {
  state: DialogState;
  close: () => void;
  remove: () => void;
}) {
  const { config, info } = state;
  const panel = useRef<HTMLDivElement>(null);
  const {
    title,
    content,
    icon,
    autoFocusButton,
    onOk,
    onCancel,
    afterClose,
    okButtonProps,
    cancelButtonProps,
    footer,
    ...props
  } = config;
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const confirm = () => {
    if (locked.current || okButtonProps?.loading || okButtonProps?.disabled)
      return;
    if (!onOk) {
      close();
      return;
    }
    // Some callers update the dialog during an operation and invoke close only after recovery or success.
    const result = onOk(close);
    if (result && typeof result === "object" && "then" in result) {
      locked.current = true;
      setPending(true);
      Promise.resolve(result).then(close, () => {
        locked.current = false;
        setPending(false);
      });
    } else if (onOk.length === 0) close();
  };
  const busy = pending || !!okButtonProps?.loading;
  return (
    <Modal
      {...props}
      open={state.open}
      panelRef={panel}
      afterOpenChange={(isOpen) => {
        if (isOpen && autoFocusButton) {
          const buttons = panel.current?.querySelectorAll<HTMLButtonElement>(
            ".ui-modal-footer button"
          );
          (autoFocusButton === "cancel"
            ? buttons?.[0]
            : buttons?.[buttons.length - 1]
          )?.focus();
        }
        props.afterOpenChange?.(isOpen);
      }}
      title={
        <span className="ui-modal-confirm-title">
          {icon}
          {title}
        </span>
      }
      className={["ui-modal-confirm", props.className]
        .filter(Boolean)
        .join(" ")}
      zIndex={props.zIndex ?? 2000}
      closable={props.closable ?? false}
      mask={props.mask ?? { closable: false }}
      keyboard={!busy && props.keyboard !== false}
      footer={
        footer === undefined
          ? (_, { OkBtn, CancelBtn }) => (
              <div className="ui-modal-confirm-btns">
                {!info && <CancelBtn />}
                <OkBtn />
              </div>
            )
          : footer
      }
      onCancel={() => {
        if (!busy) {
          onCancel?.();
          close();
        }
      }}
      onOk={confirm}
      okButtonProps={{ ...okButtonProps, loading: busy }}
      cancelButtonProps={{
        ...cancelButtonProps,
        disabled: busy || cancelButtonProps?.disabled
      }}
      afterClose={() => {
        remove();
        afterClose?.();
      }}
    >
      {content}
    </Modal>
  );
}

export function App({
  children,
  message: defaults
}: {
  children?: ReactNode;
  message?: { duration?: number };
}) {
  const duration = defaults?.duration;
  const [notices, setNotices] = useState<Notice[]>([]);
  const [dialogs, setDialogs] = useState<DialogState[]>([]);
  const closeDialog = useCallback(
    (id: number) =>
      setDialogs((list) =>
        list.map((d) => (d.id === id ? { ...d, open: false } : d))
      ),
    []
  );
  const api = useMemo<Feedback>(() => {
    const push = (notification: boolean, config: NoticeConfig) => {
      const notice: Notice = {
        duration: notification ? undefined : duration,
        ...config,
        notification,
        id: config.key ?? ++sequence
      };
      setNotices((list) => [
        ...list.filter(
          (n) => n.notification !== notification || n.id !== notice.id
        ),
        notice
      ]);
    };
    const destroy = (notification: boolean, key?: Key) =>
      setNotices((list) =>
        list.filter(
          (n) =>
            n.notification !== notification ||
            (key !== undefined && n.id !== key)
        )
      );
    const show = (info: boolean, config: Confirmation) => {
      const id = ++sequence;
      setDialogs((list) => [...list, { id, info, open: true, config }]);
      return {
        destroy: () => closeDialog(id),
        update: (changes: Partial<Confirmation>) =>
          setDialogs((list) =>
            list.map((d) =>
              d.id === id ? { ...d, config: { ...d.config, ...changes } } : d
            )
          )
      };
    };
    const notify =
      (type: NoticeKind) => (content: ReactNode, duration?: number) =>
        push(false, { type, content, duration });
    return {
      message: {
        success: notify("success"),
        error: notify("error"),
        warning: notify("warning"),
        info: notify("info"),
        loading: notify("loading"),
        open: (c) => push(false, c),
        destroy: (key) => destroy(false, key)
      },
      notification: {
        success: (c) => push(true, { type: "success", ...c }),
        destroy: (key) => destroy(true, key)
      },
      modal: { confirm: (c) => show(false, c), error: (c) => show(true, c) }
    };
  }, [closeDialog, duration]);
  useLayoutEffect(() => {
    mounted.push(api);
    return () => {
      const index = mounted.indexOf(api);
      if (index >= 0) mounted.splice(index, 1);
    };
  }, [api]);
  return (
    <Context.Provider value={api}>
      <div className="ui-app">{children}</div>
      {dialogs.map((d) => (
        <ConfirmationDialog
          key={d.id}
          state={d}
          close={() => closeDialog(d.id)}
          remove={() =>
            setDialogs((list) => list.filter((entry) => entry.id !== d.id))
          }
        />
      ))}
      {notices.length > 0 &&
        createPortal(
          <>
            {[false, true].map((notification) => (
              <div
                key={String(notification)}
                className={notification ? "ui-notification" : "ui-message"}
              >
                {notices
                  .filter((n) => n.notification === notification)
                  .map((n) => (
                    <MessageNotice
                      key={n.id}
                      notice={n}
                      onClose={() => {
                        setNotices((list) => list.filter((item) => item !== n));
                        n.onClose?.();
                      }}
                    />
                  ))}
              </div>
            ))}
          </>,
          document.body
        )}
    </Context.Provider>
  );
}

function staticApi(): Feedback {
  if (!mounted.length) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    flushSync(() => root.render(<App />));
  }
  return mounted[mounted.length - 1]!;
}

function BindMessages({ sink }: { sink: React.RefObject<MessageApi | null> }) {
  const current = useContext(Context)!.message;
  useLayoutEffect(() => {
    sink.current = current;
    return () => {
      sink.current = null;
    };
  }, [current, sink]);
  return null;
}

function useMessage(): [MessageApi, ReactNode] {
  const current = useContext(Context);
  const sink = useRef<MessageApi | null>(null);
  const local = useMemo<MessageApi>(
    () => ({
      success: (...args) => sink.current?.success(...args),
      error: (...args) => sink.current?.error(...args),
      warning: (...args) => sink.current?.warning(...args),
      info: (...args) => sink.current?.info(...args),
      loading: (...args) => sink.current?.loading(...args),
      destroy: (key) => sink.current?.destroy(key),
      open: (config) => sink.current?.open(config)
    }),
    []
  );
  return current
    ? [current.message, null]
    : [
        local,
        <App key="feedback">
          <BindMessages sink={sink} />
        </App>
      ];
}

export const message: MessageApi & {
  useMessage: () => [MessageApi, ReactNode];
} = {
  useMessage,
  success: (...args) => staticApi().message.success(...args),
  error: (...args) => staticApi().message.error(...args),
  warning: (...args) => staticApi().message.warning(...args),
  info: (...args) => staticApi().message.info(...args),
  loading: (...args) => staticApi().message.loading(...args),
  open: (config) => staticApi().message.open(config),
  destroy: (key) => mounted.at(-1)?.message.destroy(key)
};
const fallback: Feedback = {
  message,
  modal: {
    confirm: (c) => staticApi().modal.confirm(c),
    error: (c) => staticApi().modal.error(c)
  },
  notification: {
    success: (c) => staticApi().notification.success(c),
    destroy: (key) => mounted.at(-1)?.notification.destroy(key)
  }
};
App.useApp = function useApp() {
  return useContext(Context) ?? fallback;
};
