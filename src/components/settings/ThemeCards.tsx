export function ThemeCards({
  onSelect,
}: {
  onSelect: (theme: "light" | "dark" | "system") => void;
}) {
  return (
    <div>
      <button onClick={() => onSelect("light")}>浅色模式</button>
      <button onClick={() => onSelect("dark")}>深色模式</button>
      <button onClick={() => onSelect("system")}>跟随系统</button>
    </div>
  );
}
