import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(
  new URL("../../apps/admin/package.json", import.meta.url)
);
const path = (value: string) => fileURLToPath(new URL(value, import.meta.url));
export default async () => {
  const { default: react } = await import(
    require.resolve("@vitejs/plugin-react")
  );
  return {
    root: path("./"),
    plugins: [react()],
    resolve: {
      alias: {
        "@": path("../../apps/admin/src"),
        react: path("../../apps/admin/node_modules/react"),
        "react-dom": path("../../apps/admin/node_modules/react-dom"),
        "@tsz/ui/admin/display": require.resolve("@tsz/ui/admin/display"),
        "@tsz/ui/admin/forms": require.resolve("@tsz/ui/admin/forms"),
        "@tsz/ui/admin/overlays": require.resolve("@tsz/ui/admin/overlays")
      }
    },
    server: {
      host: "127.0.0.1",
      port: 4311,
      strictPort: true,
      fs: { allow: [path("../../")] }
    }
  };
};
