export default function SiteIcon({
  name,
}: {
  name: "github" | "search" | "menu";
}) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {name === "search" ? (
        <>
          <circle cx="10.8" cy="10.8" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </>
      ) : name === "menu" ? (
        <>
          <path d="M4 8h16M4 16h16" />
        </>
      ) : (
        <>
          <path d="M9 19c-4 1.2-4-2-6-2.5M15 22v-3.5c0-1 .1-1.5-.5-2 3.5-.4 7-1.7 7-6A5 5 0 0 0 20 7c.2-.9.2-2-.3-3.3 0 0-1.3-.4-4 1.4a13 13 0 0 0-7.4 0c-2.7-1.8-4-1.4-4-1.4C3.8 5 3.8 6.1 4 7a5 5 0 0 0-1.5 3.5c0 4.3 3.5 5.6 7 6-.6.5-.5 1-.5 2V22" />
        </>
      )}
    </svg>
  );
}
