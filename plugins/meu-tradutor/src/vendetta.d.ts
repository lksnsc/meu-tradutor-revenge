declare namespace JSX {
  interface Element {}
  interface IntrinsicAttributes { key?: string | number }
  interface ElementChildrenAttribute { children: {} }
}

declare module "@vendetta/plugin" {
  export const storage: unknown;
}

declare module "@vendetta/metro" {
  export function findByName(name: string, defaultExp?: boolean): unknown;
  export function findByPropsAll(...properties: string[]): unknown[];
  export function find(filter: (value: unknown) => boolean): unknown;
  export function findByProps(...properties: string[]): unknown;
  export const findByStoreName: ((name: string) => unknown) | undefined;
}

declare module "@vendetta/metro/common" {
  type StateSetter<T> = (value: T | ((previous: T) => T)) => void;

  interface CommonProps {
    children?: unknown;
    style?: object | readonly (object | false | undefined)[];
    accessibilityLabel?: string;
  }

  interface PressableProps extends CommonProps {
    onPress: () => void;
    accessibilityRole?: "button" | "tab";
    accessibilityState?: { selected?: boolean };
  }

  interface TextInputProps extends CommonProps {
    value: string;
    onChangeText: (text: string) => void;
    onBlur?: () => void;
    onSubmitEditing?: () => void;
    keyboardType?: "default" | "number-pad" | "url";
    inputMode?: "text" | "numeric" | "url";
    secureTextEntry?: boolean;
    autoCapitalize?: "none";
    autoCorrect?: boolean;
    autoComplete?: "off";
    placeholder?: string;
    placeholderTextColor?: string;
    maxLength?: number;
  }

  interface SwitchProps extends CommonProps {
    value: boolean;
    onValueChange: (value: boolean) => void;
    trackColor?: { false: string; true: string };
  }

  export const React: {
    createElement<P>(component: (props: P) => JSX.Element, props: P): JSX.Element;
    Fragment: unknown;
    useState<T>(initial: T | (() => T)): [T, StateSetter<T>];
    useEffect(effect: () => void | (() => void), dependencies: readonly unknown[]): void;
  };

  export const ReactNative: {
    View: (props: CommonProps) => JSX.Element;
    Text: (props: CommonProps) => JSX.Element;
    ScrollView: (props: CommonProps & {
      contentContainerStyle?: object;
      keyboardShouldPersistTaps?: "handled";
    }) => JSX.Element;
    Pressable: (props: PressableProps) => JSX.Element;
    TextInput: (props: TextInputProps) => JSX.Element;
    Switch: (props: SwitchProps) => JSX.Element;
  };

  export const FluxDispatcher: {
    dispatch(action: { type: string; message: unknown }): unknown;
  } | undefined;
}

declare module "@vendetta/patcher" {
  export function before<A extends unknown[], R>(
    property: string, object: object, hook: (args: A) => void,
  ): () => void;
  export function instead<A extends unknown[], R>(
    property: string, object: object, hook: (args: A, original: (...args: A) => R) => R,
  ): () => void;
}

declare module "@vendetta/storage" {
  export function useProxy<T extends object>(storage: T): T;
}

declare module "@vendetta/ui/toasts" {
  export function showToast(text: string, asset?: number): void;
}
