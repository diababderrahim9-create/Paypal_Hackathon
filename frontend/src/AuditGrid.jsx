import {
  ClientSideRowModelModule,
  ModuleRegistry,
  NumberFilterModule,
  PaginationModule,
  QuickFilterModule,
  RowSelectionModule,
  TextFilterModule,
  themeQuartz,
} from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  NumberFilterModule,
  PaginationModule,
  QuickFilterModule,
  RowSelectionModule,
  TextFilterModule,
]);

const gridTheme = themeQuartz.withParams({
  backgroundColor: '#0f151d',
  foregroundColor: '#c4ced8',
  headerBackgroundColor: '#121b25',
  headerTextColor: '#77889b',
  borderColor: '#202b38',
  rowHoverColor: '#151f2a',
  selectedRowBackgroundColor: '#162a2b',
  oddRowBackgroundColor: '#0f151d',
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  fontSize: 12,
  headerFontSize: 10,
  rowHeight: 48,
  headerHeight: 42,
});

const money = (value) =>
  Number.isFinite(Number(value))
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number(value))
    : '—';
const dateTime = (value) => (value ? new Date(value).toLocaleString() : '—');

function Badge({ children, tone = 'neutral', dot = false }) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}

function DecisionBadge({ decision }) {
  const tone = decision === 'ALLOW' ? 'mint' : decision === 'ASK_HUMAN' ? 'amber' : 'red';
  return <Badge tone={tone} dot>{decision || 'PENDING'}</Badge>;
}

export default function AuditGrid({ rowData, columnDefs, quickFilterText, onRowSelected }) {
  const columns = [
    { field: 'id', headerName: 'ID', width: 76, pinned: 'left', filter: 'agNumberColumnFilter' },
    { field: 'timestamp', headerName: 'Timestamp', minWidth: 168, valueFormatter: (p) => dateTime(p.value) },
    { field: 'request_summary', headerName: 'Request summary', minWidth: 210, flex: 1.1 },
    { field: 'merchant', headerName: 'Merchant', minWidth: 145 },
    { field: 'quoted_amount', headerName: 'Quoted', width: 108, valueFormatter: (p) => money(p.value), filter: 'agNumberColumnFilter' },
    { field: 'checkout_amount', headerName: 'Checkout', width: 112, valueFormatter: (p) => money(p.value), filter: 'agNumberColumnFilter' },
    {
      field: 'decision',
      headerName: 'Decision',
      width: 126,
      cellRenderer: (p) => <DecisionBadge decision={p.value} />,
    },
    { field: 'reason', headerName: 'Policy reason', minWidth: 240, flex: 1.2 },
    { field: 'risk_score', headerName: 'Risk', width: 84, filter: 'agNumberColumnFilter' },
    { field: 'paypal_order_id', headerName: 'PayPal order', minWidth: 145 },
    {
      field: 'payment_status',
      headerName: 'Payment status',
      minWidth: 170,
      cellRenderer: (p) => {
        const tone = p.value === 'CAPTURED'
          ? 'mint'
          : p.value === 'BLOCKED' || p.value === 'REJECTED'
            ? 'red'
            : p.value?.includes('APPROVAL')
              ? 'amber'
              : 'neutral';
        return <Badge tone={tone}>{p.value || '—'}</Badge>;
      },
    },
    { field: 'prev_hash', headerName: 'Previous hash', minWidth: 150, valueFormatter: (p) => p.value ? `${p.value.slice(0, 12)}…` : '—' },
    { field: 'entry_hash', headerName: 'Entry hash', minWidth: 150, valueFormatter: (p) => p.value ? `${p.value.slice(0, 12)}…` : '—' },
  ];

  return (
    <div className="ag-theme-warden ledger-grid">
      <AgGridReact
        theme={gridTheme}
        rowData={rowData}
        columnDefs={columnDefs || columns}
        defaultColDef={{ sortable: true, resizable: true, filter: true, floatingFilter: false }}
        quickFilterText={quickFilterText}
        rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
        onRowClicked={(event) => onRowSelected(event.data)}
        getRowId={(params) => String(params.data.id)}
        pagination
        paginationPageSize={8}
        paginationPageSizeSelector={false}
        suppressCellFocus
        animateRows={false}
        overlayNoRowsTemplate="<span class='grid-empty'>No audit entries match these filters.</span>"
      />
    </div>
  );
}
