export function Footer() {
  const year = new Date().getFullYear();
  const href = `https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(typeof window !== "undefined" ? window.location.hostname : "")}`;
  return (
    <footer className="border-t border-border py-4 px-6 text-center">
      <p className="text-xs text-muted-foreground">
        © {year}. Built with ♥ using{" "}
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-neon-blue hover:text-neon-blue/70 transition-colors"
        >
          caffeine.ai
        </a>
      </p>
    </footer>
  );
}
