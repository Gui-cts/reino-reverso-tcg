import { CHANGELOG, formatChangelogDate } from "../data/changelog";

export type MenuTab = "play" | "decks" | "tests" | "account";

export const MENU_TABS: { id: MenuTab; label: string }[] = [
  { id: "play", label: "Jogar" },
  { id: "decks", label: "Decks" },
  { id: "tests", label: "Testes" },
  { id: "account", label: "Conta" },
];

export type MenuShellOptions = {
  activeTab: MenuTab;
  onTabChange: (tab: MenuTab) => void;
  accountNickname?: string | null;
  statusMessage?: string;
};

export function createMenuAppRoot(): HTMLElement {
  const root = document.createElement("div");
  root.className = "menu-app";
  return root;
}

export function appendMenuTopbar(parent: HTMLElement, options: MenuShellOptions): void {
  const bar = document.createElement("header");
  bar.className = "menu-topbar";

  const inner = document.createElement("div");
  inner.className = "menu-topbar__inner";

  const brand = document.createElement("div");
  brand.className = "menu-topbar__brand";
  brand.innerHTML = `
    <span class="menu-topbar__logo">Reino Reverso</span>
    <span class="menu-topbar__version">TCG · protótipo</span>
  `;
  inner.appendChild(brand);

  const nav = document.createElement("nav");
  nav.className = "menu-topbar__nav";
  nav.setAttribute("aria-label", "Menu principal");

  for (const tab of MENU_TABS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `menu-topbar__tab${options.activeTab === tab.id ? " menu-topbar__tab--active" : ""}`;
    let label = tab.label;
    if (tab.id === "account" && options.accountNickname) {
      label = `${tab.label} · ${options.accountNickname}`;
    }
    btn.textContent = label;
    btn.setAttribute("aria-current", options.activeTab === tab.id ? "page" : "false");
    btn.onclick = () => options.onTabChange(tab.id);
    nav.appendChild(btn);
  }

  inner.appendChild(nav);
  bar.appendChild(inner);

  if (options.statusMessage) {
    const status = document.createElement("p");
    status.className = "menu-topbar__status";
    status.textContent = options.statusMessage;
    bar.appendChild(status);
  }

  parent.appendChild(bar);
}

export function createMenuPageLayout(): {
  page: HTMLElement;
  main: HTMLElement;
  aside: HTMLElement;
} {
  const page = document.createElement("div");
  page.className = "menu-page";

  const main = document.createElement("main");
  main.className = "menu-page__main";

  const aside = document.createElement("aside");
  aside.className = "menu-page__aside";

  appendChangelogPanel(aside);

  page.append(main, aside);
  return { page, main, aside };
}

export function appendChangelogPanel(parent: HTMLElement): void {
  const panel = document.createElement("div");
  panel.className = "menu-changelog panel";

  const head = document.createElement("div");
  head.className = "menu-changelog__head";
  head.innerHTML = `
    <h2 class="menu-changelog__title">Novidades</h2>
    <p class="menu-changelog__sub">Últimas atualizações do protótipo</p>
  `;
  panel.appendChild(head);

  const list = document.createElement("ul");
  list.className = "menu-changelog__list";

  for (const entry of CHANGELOG) {
    const item = document.createElement("li");
    item.className = "menu-changelog__item";
    item.innerHTML = `
      <time class="menu-changelog__date" datetime="${entry.date}">${formatChangelogDate(entry.date)}</time>
      <strong class="menu-changelog__entry-title">${entry.title}</strong>
      <p class="menu-changelog__summary">${entry.summary}</p>
    `;
    list.appendChild(item);
  }

  panel.appendChild(list);
  parent.appendChild(panel);
}
