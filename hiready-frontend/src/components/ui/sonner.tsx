import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Toasts, pinned to the light theme because the app has one theme.
 *
 * This read the theme from next-themes, which no ThemeProvider was ever
 * mounted for — so `useTheme()` returned its default and the value meant
 * nothing. Sonner's own default is "system", which would make toasts render
 * dark on a dark-preferring OS while every other surface stayed light. The
 * accident was invisible only because the fallback happened to be harmless.
 *
 * If a real dark theme is ever built, this becomes `useTheme()` again and the
 * provider goes in App.tsx. See the note in tailwind.config.ts.
 */
const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="light"
    className="toaster group"
    toastOptions={{
      classNames: {
        toast:
          "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
        description: "group-[.toast]:text-muted-foreground",
        actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
        cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
      },
    }}
    {...props}
  />
);

export { Toaster, toast };
