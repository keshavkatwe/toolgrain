import Link from "@docusaurus/Link";
import SiteIcon from "@site/src/components/SiteIcon";
import index from "@site/src/generated/search-index.json";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./styles.module.css";

export default function SearchBar() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return index
      .map((page) => ({
        ...page,
        score: words.every((word) =>
          `${page.title} ${page.content}`.toLowerCase().includes(word),
        )
          ? words.reduce(
              (score, word) =>
                score + (page.title.toLowerCase().includes(word) ? 10 : 1),
              0,
            )
          : 0,
      }))
      .filter((page) => page.score > 0)
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
      .slice(0, 8);
  }, [query]);
  const open = () => {
    dialog.current?.showModal();
    input.current?.focus();
  };
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        dialog.current?.showModal();
        input.current?.focus();
      }
    }
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, []);
  return (
    <>
      <button
        className={styles.trigger}
        type="button"
        onClick={open}
        aria-label="Search documentation"
        title="Search documentation (⌘ / Ctrl K)"
      >
        <SiteIcon name="search" />
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="search-title"
      >
        <div className={styles.top}>
          <h2 id="search-title">Search documentation</h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close search"
          >
            Esc
          </button>
        </div>
        <label htmlFor="docs-search" className="sr-only">
          Search the Toolgrain documentation
        </label>
        <input
          id="docs-search"
          ref={input}
          type="search"
          placeholder="Try “context providers” or “HTTP”…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
        />
        <p className={styles.hint} role="status">
          {query.trim()
            ? `${results.length} matching ${results.length === 1 ? "page" : "pages"}`
            : "Search all guides and API reference pages. Results stay on your device."}
        </p>
        <ul className={styles.results}>
          {results.map((page) => {
            const at = page.content
              .toLowerCase()
              .indexOf(query.trim().toLowerCase().split(/\s+/)[0]);
            return (
              <li key={page.path}>
                <Link to={page.path} onClick={() => dialog.current?.close()}>
                  <strong>{page.title}</strong>
                  <span>
                    {at > 40 ? "…" : ""}
                    {page.content.slice(
                      Math.max(0, at - 40),
                      Math.max(0, at - 40) + 150,
                    )}
                    …
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </dialog>
    </>
  );
}
