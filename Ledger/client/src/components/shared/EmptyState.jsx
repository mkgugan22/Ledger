import { BookOpen } from "lucide-react";

export default function EmptyState({ text }) {
  return (
    <div className="lg-empty d-flex flex-column align-items-center gap-2">
      <BookOpen size={22} color="var(--lg-rule)" />
      <span className="small">{text}</span>
    </div>
  );
}
