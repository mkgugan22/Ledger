import { Form } from "react-bootstrap";

export default function MonthPicker({ value, onChange }) {
  return (
    <Form.Control
      type="month"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ maxWidth: 190 }}
    />
  );
}
