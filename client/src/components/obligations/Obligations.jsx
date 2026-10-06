import { useMemo, useState } from "react";
import { Card, Row, Col, Form, Button, Table, Badge } from "react-bootstrap";
import { CreditCard, CalendarDays, PlusCircle, CheckCircle2, Trash2 } from "lucide-react";
import PageHeader from "../shared/PageHeader.jsx";
import { fmtINR } from "../../lib/format.js";

const today = () => new Date().toISOString().slice(0, 10);

export default function Obligations({
  debts = [],
  bills = [],
  addDebt,
  updateDebt,
  deleteDebt,
  addBill,
  updateBill,
  deleteBill,
}) {
  const [debt, setDebt] = useState({ name: "", debtType: "Loan", originalAmount: "", outstandingAmount: "", interestRate: "", minimumPayment: "", dueDate: "" });
  const [bill, setBill] = useState({ name: "", amount: "", dueDate: today(), category: "General", recurring: false });

  const activeDebt = useMemo(() => debts.filter((x) => x.status !== "paid"), [debts]);
  const upcomingBills = useMemo(() => bills.filter((x) => x.status !== "paid" && x.dueDate >= today()).sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [bills]);

  async function submitDebt(e) {
    e.preventDefault();
    if (!debt.name || debt.originalAmount === "" || debt.outstandingAmount === "" || !addDebt) return;
    await addDebt({
      ...debt,
      originalAmount: Number(debt.originalAmount),
      outstandingAmount: Number(debt.outstandingAmount),
      interestRate: debt.interestRate === "" ? undefined : Number(debt.interestRate),
      minimumPayment: debt.minimumPayment === "" ? 0 : Number(debt.minimumPayment),
    });
    setDebt({ name: "", debtType: "Loan", originalAmount: "", outstandingAmount: "", interestRate: "", minimumPayment: "", dueDate: "" });
  }

  async function submitBill(e) {
    e.preventDefault();
    if (!bill.name || bill.amount === "" || !bill.dueDate || !addBill) return;
    await addBill({ ...bill, amount: Number(bill.amount) });
    setBill({ name: "", amount: "", dueDate: today(), category: "General", recurring: false });
  }

  return (
    <div>
      <PageHeader title="Obligations" subtitle="Track debts and upcoming bills without changing your existing ledger entries" />
      <Row className="g-3 mb-3">
        <Col lg={6}>
          <Card className="lg-card h-100"><Card.Body>
            <div className="font-serif fs-5 mb-3 d-flex align-items-center gap-2"><CreditCard size={17} /> Add debt</div>
            <Form onSubmit={submitDebt}>
              <Row className="g-2">
                <Col xs={12}><Form.Control placeholder="Debt name" value={debt.name} onChange={(e) => setDebt({ ...debt, name: e.target.value })} /></Col>
                <Col sm={6}><Form.Select value={debt.debtType} onChange={(e) => setDebt({ ...debt, debtType: e.target.value })}>{["Loan","Credit Card","EMI","Other"].map((x) => <option key={x}>{x}</option>)}</Form.Select></Col>
                <Col sm={6}><Form.Control type="number" min="0" placeholder="Original amount" value={debt.originalAmount} onChange={(e) => setDebt({ ...debt, originalAmount: e.target.value })} /></Col>
                <Col sm={6}><Form.Control type="number" min="0" placeholder="Outstanding amount" value={debt.outstandingAmount} onChange={(e) => setDebt({ ...debt, outstandingAmount: e.target.value })} /></Col>
                <Col sm={6}><Form.Control type="number" min="0" step="0.01" placeholder="Interest %" value={debt.interestRate} onChange={(e) => setDebt({ ...debt, interestRate: e.target.value })} /></Col>
                <Col sm={6}><Form.Control type="number" min="0" placeholder="Minimum payment" value={debt.minimumPayment} onChange={(e) => setDebt({ ...debt, minimumPayment: e.target.value })} /></Col>
                <Col sm={6}><Form.Control type="date" value={debt.dueDate} onChange={(e) => setDebt({ ...debt, dueDate: e.target.value })} /></Col>
                <Col xs={12}><Button type="submit" size="sm" className="d-inline-flex align-items-center gap-2"><PlusCircle size={14} /> Save debt</Button></Col>
              </Row>
            </Form>
          </Card.Body></Card>
        </Col>
        <Col lg={6}>
          <Card className="lg-card h-100"><Card.Body>
            <div className="font-serif fs-5 mb-3 d-flex align-items-center gap-2"><CalendarDays size={17} /> Add bill</div>
            <Form onSubmit={submitBill}>
              <Row className="g-2">
                <Col xs={12}><Form.Control placeholder="Bill name" value={bill.name} onChange={(e) => setBill({ ...bill, name: e.target.value })} /></Col>
                <Col sm={6}><Form.Control type="number" min="0" placeholder="Amount" value={bill.amount} onChange={(e) => setBill({ ...bill, amount: e.target.value })} /></Col>
                <Col sm={6}><Form.Control type="date" value={bill.dueDate} onChange={(e) => setBill({ ...bill, dueDate: e.target.value })} /></Col>
                <Col sm={6}><Form.Control placeholder="Category" value={bill.category} onChange={(e) => setBill({ ...bill, category: e.target.value })} /></Col>
                <Col sm={6}><Form.Check className="mt-2" type="checkbox" label="Repeats monthly" checked={bill.recurring} onChange={(e) => setBill({ ...bill, recurring: e.target.checked })} /></Col>
                <Col xs={12}><Button type="submit" size="sm" className="d-inline-flex align-items-center gap-2"><PlusCircle size={14} /> Save bill</Button></Col>
              </Row>
            </Form>
          </Card.Body></Card>
        </Col>
      </Row>

      <Card className="lg-card mb-3"><Card.Body>
        <div className="d-flex justify-content-between align-items-center mb-3"><div className="font-serif fs-5">Active debts</div><Badge bg="secondary">{activeDebt.length}</Badge></div>
        {activeDebt.length ? <div className="table-responsive"><Table className="lg-table mb-0"><thead><tr><th>Name</th><th>Type</th><th className="text-end">Outstanding</th><th className="text-end">Min payment</th><th>Due</th><th></th></tr></thead><tbody>{activeDebt.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.debtType}</td><td className="text-end font-mono">₹{fmtINR(item.outstandingAmount)}</td><td className="text-end font-mono">₹{fmtINR(item.minimumPayment)}</td><td>{item.dueDate || "—"}</td><td className="text-end"><Button size="sm" variant="outline-secondary" onClick={() => updateDebt?.(item.id, { status: "paid" })}><CheckCircle2 size={14} /></Button> <Button size="sm" variant="outline-danger" onClick={() => deleteDebt?.(item.id)}><Trash2 size={14} /></Button></td></tr>)}</tbody></Table></div> : <div className="text-secondary small">No active debts recorded.</div>}
      </Card.Body></Card>

      <Card className="lg-card"><Card.Body>
        <div className="d-flex justify-content-between align-items-center mb-3"><div className="font-serif fs-5">Upcoming bills</div><Badge bg="secondary">{upcomingBills.length}</Badge></div>
        {upcomingBills.length ? <div className="table-responsive"><Table className="lg-table mb-0"><thead><tr><th>Bill</th><th>Category</th><th className="text-end">Amount</th><th>Due</th><th></th></tr></thead><tbody>{upcomingBills.slice(0, 20).map((item) => <tr key={item.id}><td>{item.name}{item.recurring && <small className="text-secondary ms-2">monthly</small>}</td><td>{item.category}</td><td className="text-end font-mono">₹{fmtINR(item.amount)}</td><td>{item.dueDate}</td><td className="text-end"><Button size="sm" variant="outline-secondary" onClick={() => updateBill?.(item.id, { status: "paid" })}><CheckCircle2 size={14} /></Button> <Button size="sm" variant="outline-danger" onClick={() => deleteBill?.(item.id)}><Trash2 size={14} /></Button></td></tr>)}</tbody></Table></div> : <div className="text-secondary small">No upcoming bills recorded.</div>}
      </Card.Body></Card>
    </div>
  );
}
