'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { CreditCard, ArrowRight, CheckCircle } from 'lucide-react';
import { Skeleton } from '@/components/Skeleton';

export default function DashboardPage() {
  const [summary, setSummary] = useState<any>(null);
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));

  // Quick Payment Tool State
  const [tenants, setTenants] = useState<any[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [dueInvoices, setDueInvoices] = useState<any[]>([]);
  const [loadingDue, setLoadingDue] = useState(false);
  const [paymentAmounts, setPaymentAmounts] = useState<{ [invoiceId: number]: string }>({});
  const [paymentModes, setPaymentModes] = useState<{ [invoiceId: number]: string }>({});
  const [payingInvoiceId, setPayingInvoiceId] = useState<number | null>(null);

  const fetchSummary = async () => {
    try {
      const { data } = await api.get(`/dashboard/summary?month=${month}`);
      setSummary(data);
    } catch (err) {
      console.error("Failed to fetch dashboard summary", err);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [month]);

  // Load all tenants for the dropdown on mount
  useEffect(() => {
    const fetchTenants = async () => {
      try {
        const { data } = await api.get('/tenants');
        setTenants(data.filter((t: any) => t.status === 'active'));
      } catch (err) {
        console.error('Failed to load tenants', err);
      }
    };
    fetchTenants();
  }, []);

  // Fetch due invoices when selected tenant changes
  const handleTenantChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tenantId = e.target.value;
    setSelectedTenantId(tenantId);
    setDueInvoices([]);
    if (!tenantId) return;

    setLoadingDue(true);
    try {
      const { data } = await api.get(`/invoices/due/${tenantId}`);
      setDueInvoices(data);
      
      // Initialize payment inputs
      const initialAmounts: { [invoiceId: number]: string } = {};
      const initialModes: { [invoiceId: number]: string } = {};
      data.forEach((inv: any) => {
        initialAmounts[inv.id] = (inv.total_amount - inv.received_amount).toFixed(2);
        initialModes[inv.id] = 'Cash';
      });
      setPaymentAmounts(initialAmounts);
      setPaymentModes(initialModes);
    } catch (err) {
      toast.error('Failed to load due invoices');
    } finally {
      setLoadingDue(false);
    }
  };

  const handlePayAmountChange = (invoiceId: number, val: string) => {
    setPaymentAmounts(prev => ({ ...prev, [invoiceId]: val }));
  };

  const handlePayModeChange = (invoiceId: number, val: string) => {
    setPaymentModes(prev => ({ ...prev, [invoiceId]: val }));
  };

  const handleRecordPayment = async (invoiceId: number) => {
    const amount = parseFloat(paymentAmounts[invoiceId]);
    const mode = paymentModes[invoiceId] || 'Cash';

    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setPayingInvoiceId(invoiceId);
    try {
      const payload = {
        amount,
        payment_mode: mode,
        payment_date: format(new Date(), 'yyyy-MM-dd')
      };
      await api.post(`/invoices/${invoiceId}/add-payment`, payload);
      toast.success('Payment recorded successfully');

      // Refresh data
      fetchSummary();
      // Reload due list
      const { data } = await api.get(`/invoices/due/${selectedTenantId}`);
      setDueInvoices(data);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to record payment');
    } finally {
      setPayingInvoiceId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard Overview</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter Month:</label>
          <input 
            type="month" 
            className="rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-1.5 text-sm focus:ring-blue-500 focus:border-blue-500"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
      </div>

      {summary ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Total Tenants</h3>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{summary.total_tenants}</p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-2 font-semibold">{summary.active_tenants} active</p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Pending Invoices</h3>
            <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{summary.pending_invoices_count}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Due Amount</h3>
            <p className="text-3xl font-bold text-red-600 dark:text-red-400">₹{summary.due_amount.toFixed(2)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Received Amount</h3>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">₹{summary.received_amount.toFixed(2)}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
              <Skeleton className="h-4 w-28 mb-3" />
              <Skeleton className="h-8 w-20 mb-2" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      )}

      {/* Quick Action Payment Collection Tool */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Quick Payment Collector</h2>
        <div className="max-w-md mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Tenant to View Unpaid Invoices</label>
          <select 
            value={selectedTenantId} 
            onChange={handleTenantChange}
            className="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="">-- Select Tenant --</option>
            {tenants.map(t => (
              <option key={t.id} value={t.id}>{t.name} (Room {t.room_no})</option>
            ))}
          </select>
        </div>

        {loadingDue && (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-9 w-40" />
              </div>
            ))}
          </div>
        )}

        {!loadingDue && selectedTenantId && dueInvoices.length === 0 && (
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm font-medium">All invoices for this tenant are fully paid!</span>
          </div>
        )}

        {!loadingDue && dueInvoices.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Unpaid Invoices</h3>
            <div className="grid grid-cols-1 gap-4">
              {dueInvoices.map((invoice) => {
                const dueAmount = invoice.total_amount - invoice.received_amount;
                return (
                  <div key={invoice.id} className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-bold text-gray-900 dark:text-white">{format(new Date(`${invoice.month}-01`), 'MMMM yyyy')}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total: ₹{invoice.total_amount.toFixed(2)} | Paid: ₹{invoice.received_amount.toFixed(2)}</p>
                      <p className="text-sm font-semibold text-red-650 dark:text-red-400 mt-1">Remaining Due: ₹{dueAmount.toFixed(2)}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Receive Amt (₹):</span>
                        <input 
                          type="number" 
                          step="0.01"
                          max={dueAmount}
                          placeholder="Amount"
                          value={paymentAmounts[invoice.id] || ''}
                          onChange={(e) => handlePayAmountChange(invoice.id, e.target.value)}
                          className="w-28 rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Mode:</span>
                        <select 
                          value={paymentModes[invoice.id] || 'Cash'}
                          onChange={(e) => handlePayModeChange(invoice.id, e.target.value)}
                          className="rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-2 py-1.5 text-sm"
                        >
                          <option value="Cash">Cash</option>
                          <option value="Online">Online</option>
                          <option value="Bank Transfer">Bank Transfer</option>
                        </select>
                      </div>
                      <button
                        onClick={() => handleRecordPayment(invoice.id)}
                        disabled={payingInvoiceId === invoice.id}
                        className="flex items-center px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-55"
                      >
                        {payingInvoiceId === invoice.id ? 'Saving...' : 'Record Payment'}
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
