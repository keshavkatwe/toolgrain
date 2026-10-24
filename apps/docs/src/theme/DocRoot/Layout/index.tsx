import type { Props } from "@theme/DocRoot/Layout";
import OriginalLayout from "@theme-original/DocRoot/Layout";
import styles from "./styles.module.css";
export default function DocRootLayout(props: Props) {
  return (
    <div className={styles.frame}>
      <OriginalLayout {...props} />
    </div>
  );
}
