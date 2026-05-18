import { GameApp } from "./ui/app";

const root = document.getElementById("app");
if (!root) throw new Error("Elemento #app não encontrado");

const app = new GameApp(root);
app.init().catch((err) => {
  root.innerHTML = `<p style="color:#e85d5d">Erro ao iniciar: ${String(err)}</p>`;
  console.error(err);
});
