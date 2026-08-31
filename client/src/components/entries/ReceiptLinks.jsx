import { useEffect, useState } from "react";
import { Paperclip } from "lucide-react";
import { fetchTransactionReceipts, transactionReceiptUrl } from "../../lib/api.js";

export default function ReceiptLinks({ transactionId }) {
  const [receipts, setReceipts] = useState([]);
  useEffect(() => { fetchTransactionReceipts(transactionId).then(setReceipts).catch(() => setReceipts([])); }, [transactionId]);
  if (!receipts.length) return null;
  return <div className="small mt-1">{receipts.map((receipt) => <a key={receipt._id || receipt.id} href={transactionReceiptUrl(transactionId, receipt._id || receipt.id)} target="_blank" rel="noreferrer" className="text-secondary me-2"><Paperclip size={12} className="me-1" />{receipt.filename}</a>)}</div>;
}
