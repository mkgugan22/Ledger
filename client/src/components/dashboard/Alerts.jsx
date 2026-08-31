import { Alert } from "react-bootstrap";
import { Bell } from "lucide-react";
export default function Alerts({ alerts }) {
  if (!alerts.length) return null;
  return <div className="mb-4"><div className="font-serif mb-2 d-flex align-items-center gap-2"><Bell size={16} />Attention needed</div>{alerts.map((alert, index) => <Alert key={`${alert.text}-${index}`} variant={alert.kind} className="py-2 mb-2 small">{alert.text}</Alert>)}</div>;
}
