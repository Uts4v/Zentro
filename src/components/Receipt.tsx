// components/Receipt.tsx — Reusable receipt component for POS
export interface ReceiptProps {
  receiptNumber: string;
  merchantName: string;
  merchantAddress?: string;
  merchantPhone?: string;
  merchantLogo?: string | null;
  orderType: "dine_in" | "pickup" | "delivery";
  tableName?: string | null;
  cashierName: string;
  isWalkIn: boolean;
  walkInName?: string;
  customerName?: string;
  items: { name: string; quantity: number; price: number; subtotal: number }[];
  subtotal: number;
  total: number;
  paymentMethod: string;
  cashReceived?: number;
  fonepayAmount?: number;
  creditAccountName?: string;
  changeGiven?: number;
  paidAt: string;
  loyaltyPointsEarned?: number;
  loyaltyTotalBalance?: number;
  discountType?: "amount" | "percent" | null;
  discountValue?: number | null;
  discountAmount?: number | null;
}

export function Receipt({
  receiptNumber,
  merchantName,
  merchantAddress,
  merchantPhone,
  orderType,
  tableName,
  cashierName,
  isWalkIn,
  walkInName,
  customerName,
  items,
  subtotal,
  total,
  paymentMethod,
  cashReceived,
  fonepayAmount,
  creditAccountName,
  changeGiven,
  paidAt,
  loyaltyPointsEarned,
  loyaltyTotalBalance,
  discountType,
  discountValue,
  discountAmount,
}: ReceiptProps) {
  const dateStr = new Date(paidAt).toLocaleDateString("en-CA");
  const timeStr = new Date(paidAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const customerLabel = isWalkIn
    ? walkInName || "Walk-in"
    : customerName || "Customer";

  return (
    <div className="receipt mx-auto w-[320px] bg-white p-4 font-mono text-xs text-black shadow-lg">
      {/* Header */}
      <div className="text-center">
        <p className="text-lg font-bold">{merchantName}</p>
        {merchantAddress && (
          <p className="text-[10px] text-gray-600">{merchantAddress}</p>
        )}
        {merchantPhone && (
          <p className="text-[10px] text-gray-600">Tel: {merchantPhone}</p>
        )}
      </div>

      <div className="my-2 border-t border-dashed border-gray-300" />

      {/* Order info */}
      <div className="space-y-0.5 text-[10px]">
        <p>Receipt: {receiptNumber}</p>
        <p>Date: {dateStr} {timeStr}</p>
        <p>Customer: {customerLabel}</p>
        <p>Staff: {cashierName}</p>
        <p>
          Table:{" "}
          {orderType === "dine_in" ? tableName || "—" : "Pickup"}{" "}
          ({orderType === "dine_in" ? "Dine-in" : "Pickup"})
        </p>
      </div>

      <div className="my-2 border-t border-dashed border-gray-300" />

      {/* Items */}
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i}>
            <div className="flex justify-between">
              <span>{item.name} ×{item.quantity}</span>
              <span>NPR {item.subtotal.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="my-2 border-t border-dashed border-gray-300" />

      {/* Totals */}
      <div className="space-y-0.5 text-[10px]">
        <div className="flex justify-between">
          <span>SUBTOTAL:</span>
          <span>NPR {subtotal.toLocaleString()}</span>
        </div>
        {discountAmount != null && discountAmount > 0 && (
          <div className="flex justify-between text-emerald-700">
            <span>
              DISCOUNT{discountType === "percent" && discountValue ? ` (${discountValue}%)` : ""}:
            </span>
            <span>-NPR {discountAmount.toLocaleString()}</span>
          </div>
        )}
        <div className="flex justify-between text-xs font-bold">
          <span>TOTAL:</span>
          <span>NPR {total.toLocaleString()}</span>
        </div>
      </div>

      <div className="my-2 border-t border-dashed border-gray-300" />

      {/* Payment details */}
      <div className="space-y-0.5 text-[10px]">
        {paymentMethod === "cash" && (
          <>
            <div className="flex justify-between">
              <span>CASH RECEIVED:</span>
              <span>NPR {(cashReceived ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>CHANGE:</span>
              <span>NPR {(changeGiven ?? 0).toLocaleString()}</span>
            </div>
          </>
        )}
        {paymentMethod === "fonepay" && (
          <div className="flex justify-between">
            <span>FONEPAY:</span>
            <span>NPR {(fonepayAmount ?? total).toLocaleString()}</span>
          </div>
        )}
        {paymentMethod === "split" && (
          <>
            {(fonepayAmount ?? 0) > 0 && (
              <div className="flex justify-between">
                <span>FONEPAY:</span>
                <span>NPR {fonepayAmount!.toLocaleString()}</span>
              </div>
            )}
            {(cashReceived ?? 0) > 0 && (
              <div className="flex justify-between">
                <span>CASH RECEIVED:</span>
                <span>NPR {cashReceived!.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>CHANGE:</span>
              <span>NPR {(changeGiven ?? 0).toLocaleString()}</span>
            </div>
          </>
        )}
        {paymentMethod === "credit" && (
          <>
            <div className="flex justify-between">
              <span>CHARGED TO CREDIT:</span>
              <span>NPR {total.toLocaleString()}</span>
            </div>
            {creditAccountName && (
              <p>Account: {creditAccountName}</p>
            )}
          </>
        )}
      </div>

      {/* Loyalty points */}
      {loyaltyPointsEarned !== undefined && loyaltyPointsEarned > 0 && (
        <>
          <div className="my-2 border-t border-dashed border-gray-300" />
          <div className="space-y-0.5 text-[10px]">
            <div className="flex justify-between">
              <span>LOYALTY POINTS:</span>
              <span>+{loyaltyPointsEarned} pts</span>
            </div>
            {loyaltyTotalBalance !== undefined && (
              <div className="flex justify-between">
                <span>Total balance:</span>
                <span>{loyaltyTotalBalance} pts</span>
              </div>
            )}
          </div>
        </>
      )}

      <div className="my-2 border-t border-dashed border-gray-300" />

      {/* Footer */}
      <div className="text-center text-[10px] text-gray-500">
        <p>Thank you for visiting!</p>
        <p>Powered by Zentro</p>
      </div>
    </div>
  );
}
