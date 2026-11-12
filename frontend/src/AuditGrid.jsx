import React from 'react';
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
  backgroundColor: '#101722',
  foregroundColor: '#EBE8E0',
  headerBackgroundColor: '#121A24',
  headerTextColor: '#8FA3B0',
  borderColor: '#1E2631',
  rowHoverColor: '#162230',
  selectedRowBackgroundColor: '#1C293A',
  oddRowBackgroundColor: '#0D131C',
  fontFamily: 'Inter, -apple-system, sans-serif',
  fontSize: 12,
  headerFontSize: 11,
  rowHeight: 46,
  headerHeight: 40,
});

const money = (value) =>
  Number.isFinite(Number(value))
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number(value))
    : '—';
const dateTime = (value) => (value ? new Date(value).toLocaleString() : '—');

function DecisionBadge({ decision }) {
  const isAllow = decision === 'ALLOW';
  const isHuman = decision === 'ASK_HUMAN';
  const isDeny = decision === 'DENY';

  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
        isAllow
          ? 'bg-[#10B981]/20 text-[#10B981]'
          : isHuman
          ? 'bg-[#F59E0B]/20 text-[#F59E0B]'
          : isDeny
          ? 'bg-[#EF4444]/20 text-[#EF4444]'
          : 'bg-[#1E2631] text-[#8FA3B0]'
      }`}
    >
      {decision || 'PENDING'}
    </span>
  );
}

export default function AuditGrid({ rowData, columnDefs, quickFilterText, onRowSelected }) {
  const columns = [
    { field: 'id', headerName: 'ID', width: 70, pinned: 'left', filter: 'agNumberColumnFilter' },
    { field: 'timestamp', headerName: 'Timestamp', minWidth: 160, valueFormatter: (p) => dateTime(p.value) },
    { field: 'request_summary', headerName: 'Request Summary', minWidth: 200, flex: 1.2 },
    { field: 'merchant', headerName: 'Merchant', minWidth: 135 },
    { field: 'quoted_amount', headerName: 'Quoted', width: 95, valueFormatter: (p) => money(p.value), filter: 'agNumberColumnFilter' },
    { field: 'checkout_amount', headerName: 'Checkout', width: 100, valueFormatter: (p) => money(p.value), filter: 'agNumberColumnFilter' },
    {
      field: 'decision',
      headerName: 'Decision',
      width: 120,
      cellRenderer: (p) => <DecisionBadge decision={p.value} />,
    },
    { field: 'reason', headerName: 'Policy Reason', minWidth: 220, flex: 1.4 },
    { field: 'risk_score', headerName: 'Risk', width: 80, filter: 'agNumberColumnFilter' },
    { field: 'paypal_order_id', headerName: 'PayPal Order', minWidth: 140 },
    {
      field: 'payment_status',
      headerName: 'Payment Status',
      minWidth: 150,
      cellRenderer: (p) => {
        const isCaptured = p.value === 'CAPTURED';
        const isBlocked = p.value === 'BLOCKED' || p.value === 'REJECTED';
        const isPending = p.value?.includes('APPROVAL');
        return (
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
              isCaptured
                ? 'bg-[#10B981]/20 text-[#10B981]'
                : isBlocked
                ? 'bg-[#EF4444]/20 text-[#EF4444]'
                : isPending
                ? 'bg-[#F59E0B]/20 text-[#F59E0B]'
                : 'bg-[#1E2631] text-[#8FA3B0]'
            }`}
          >
            {p.value || '—'}
          </span>
        );
      },
    },
    {
      field: 'entry_hash',
      headerName: 'SHA-256 Seal',
      minWidth: 140,
      valueFormatter: (p) => (p.value ? `${p.value.slice(0, 10)}…` : '—'),
    },
  ];

  return (
    <div className="ag-theme-warden w-full h-[460px]">
      <AgGridReact
        theme={gridTheme}
        rowData={rowData}
        columnDefs={columnDefs || columns}
        defaultColDef={{ sortable: true, resizable: true, filter: true }}
        quickFilterText={quickFilterText}
        rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
        onRowClicked={(event) => onRowSelected(event.data)}
        getRowId={(params) => String(params.data.id)}
        pagination
        paginationPageSize={10}
        paginationPageSizeSelector={false}
        suppressCellFocus
        animateRows={false}
        overlayNoRowsTemplate="<span class='text-xs font-mono text-[#8FA3B0]'>No audit entries found.</span>"
      />
    </div>
  );
}
