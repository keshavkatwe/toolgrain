import type { Props } from "@theme/DocRoot/Layout/Main";
import styles from "./styles.module.css";
export default function DocMain({ children }: Props) {
  return (
    <main className={styles.main}>
      <div className={styles.content}>{children}</div>
    </main>
  );
}
