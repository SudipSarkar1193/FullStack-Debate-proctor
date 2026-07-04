"use client";

// Inspired by react-hot-toast library
import * as React from "react";


// =================================================================
// TYPE DEFINITIONS
// =================================================================

const TOAST_LIMIT = 1;
const TOAST_REMOVE_DELAY = 1000000;

/**
 * The properties for a toast component.
 * This can be extended to include any custom props you need.
 */
type ToastProps = {
  id?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactElement;
};

/**
 * The internal state of a toast, combining user props with internal state.
 */
type Toast = ToastProps & {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The possible action types for the toast reducer.
 */
const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const;

/**
 * A discriminated union of all possible actions to dispatch.
 */
type Action =
  | {
      type: typeof actionTypes.ADD_TOAST;
      toast: Toast;
    }
  | {
      type: typeof actionTypes.UPDATE_TOAST;
      toast: Partial<Toast>;
    }
  | {
      type: typeof actionTypes.DISMISS_TOAST;
      toastId?: Toast["id"];
    }
  | {
      type: typeof actionTypes.REMOVE_TOAST;
      toastId?: Toast["id"];
    };

/**
 * The shape of the global toast state.
 */
interface State {
  toasts: Toast[];
}

// =================================================================
// STATE MANAGEMENT (REDUCER, DISPATCHER, LISTENERS)
// =================================================================

let count = 0;

function genId(): string {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      type: actionTypes.REMOVE_TOAST,
      toastId: toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case actionTypes.ADD_TOAST:
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case actionTypes.UPDATE_TOAST:
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      };

    case actionTypes.DISMISS_TOAST: {
      const { toastId } = action;

      // Side effect: schedule removal of toast
      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id);
        });
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      };
    }

    case actionTypes.REMOVE_TOAST:
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };

    default:
      return state;
  }
};

type Listener = (state: State) => void;

const listeners: Listener[] = [];
let memoryState: State = { toasts: [] };

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

// =================================================================
// PUBLIC API (toast function and useToast hook)
// =================================================================

type ToastOptions = Omit<ToastProps, "id">;

function toast(props: ToastOptions) {
  const id = genId();

  const update = (props: ToastProps) =>
    dispatch({
      type: actionTypes.UPDATE_TOAST,
      toast: { ...props, id },
    });

  const dismiss = () => dispatch({ type: actionTypes.DISMISS_TOAST, toastId: id });

  dispatch({
    type: actionTypes.ADD_TOAST,
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  return {
    id: id,
    dismiss,
    update,
  };
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, [state]);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: actionTypes.DISMISS_TOAST, toastId }),
  };
}

export { useToast, toast };