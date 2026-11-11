import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../../apps/admin/package.json", import.meta.url)
);
const path = (value: string) => fileURLToPath(new URL(value, import.meta.url));
export default async () => {
  const { default: react } = await import(
    require.resolve("@vitejs/plugin-react")
  );
  return {
    root: path("../../"),
    plugins: [react()],
    resolve: {
      alias: {
        "@": path("../../apps/admin/src"),
        react: path("../../apps/admin/node_modules/react"),
        "react-dom": path("../../apps/admin/node_modules/react-dom"),
        "@tanstack/react-query": require.resolve("@tanstack/react-query"),
        "react-router-dom": require.resolve("react-router-dom")
      }
    },
    server: { host: "127.0.0.1", port: 4311, strictPort: true }
  };
};
