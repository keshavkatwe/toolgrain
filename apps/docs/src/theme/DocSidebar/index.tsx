import Link from "@docusaurus/Link";
import type { Props } from "@theme/DocSidebar";
import styles from "./styles.module.css";

type Item = Props["sidebar"][number];
const samePath = (a: string | undefined, b: string) =>
  typeof a === "string" && a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
function includesPath(item: Item, path: string): boolean {
  return (
    ("href" in item && samePath(item.href, path)) ||
    (item.type === "category" &&
      item.items.some((child) => includesPath(child, path)))
  );
}
function Items({ items, path }: { items: readonly Item[]; path: string }) {
  return (
    <ul className={styles.list}>
      {items.map((item) => {
        if (item.type === "category")
          return (
            <li key={item.label}>
              <details className={styles.group} open={includesPath(item, path)}>
                <summary>
                  {item.label}
                  <span aria-hidden="true">＋</span>
                </summary>
                <Items items={item.items} path={path} />
              </details>
            </li>
          );
        if (item.type === "link")
          return (
            <li key={item.href}>
              <Link
                to={item.href}
                aria-current={samePath(item.href, path) ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          );
        return null;
      })}
    </ul>
  );
}
export default function DocSidebar({ sidebar, path }: Props) {
  return (
    <div className={styles.sidebar}>
      <nav className={styles.desktop} aria-label="Documentation navigation">
        <div className={styles.heading}>
          <span>Documentation</span>
          <span>0.1</span>
        </div>
        <Items items={sidebar} path={path} />
        <Link className={styles.help} to="/docs/project/contributing">
          Build with us <span aria-hidden="true">↗</span>
        </Link>
      </nav>
      <details key={path} className={styles.mobile}>
        <summary>
          Browse documentation <span aria-hidden="true">＋</span>
        </summary>
        <nav aria-label="Documentation navigation">
          <Items items={sidebar} path={path} />
        </nav>
      </details>
    </div>
  );
}
