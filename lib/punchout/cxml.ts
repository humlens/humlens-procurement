import crypto from 'crypto';
import { XMLParser } from 'fast-xml-parser';

// cXML 1.2 for PunchOut: the setup request that opens a supplier's catalog,
// the order message that brings the cart back, and the OrderRequest that
// sends an issued PO. https://cxml.org/

export type Credentials = {
  fromDomain: string;
  fromIdentity: string;
  toDomain: string;
  toIdentity: string;
  senderIdentity: string;
  sharedSecret: string;
};

export type CartItem = {
  supplierPartId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  currency: string | null;
  unit: string | null;
};

const DOCTYPE = '<!DOCTYPE cXML SYSTEM "http://xml.cxml.org/schemas/cXML/1.2.014/cXML.dtd">';

export const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const envelope = (inner: string) => {
  const payloadId = `${Date.now()}.${crypto.randomBytes(6).toString('hex')}@humlens-procurement`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n${DOCTYPE}\n<cXML payloadID="${payloadId}" timestamp="${new Date().toISOString()}" xml:lang="en-US">${inner}</cXML>`;
};

const header = (c: Credentials) =>
  `<Header>` +
  `<From><Credential domain="${escapeXml(c.fromDomain)}"><Identity>${escapeXml(c.fromIdentity)}</Identity></Credential></From>` +
  `<To><Credential domain="${escapeXml(c.toDomain)}"><Identity>${escapeXml(c.toIdentity)}</Identity></Credential></To>` +
  `<Sender><Credential domain="${escapeXml(c.fromDomain)}"><Identity>${escapeXml(c.senderIdentity)}</Identity><SharedSecret>${escapeXml(c.sharedSecret)}</SharedSecret></Credential><UserAgent>Humlens Procurement</UserAgent></Sender>` +
  `</Header>`;

export function setupRequest(params: { credentials: Credentials; buyerCookie: string; returnUrl: string; setupUrl: string; user: { name?: string | null; email: string } }) {
  const { credentials, buyerCookie, returnUrl, setupUrl, user } = params;
  return envelope(
    header(credentials) +
      `<Request deploymentMode="production"><PunchOutSetupRequest operation="create">` +
      `<BuyerCookie>${escapeXml(buyerCookie)}</BuyerCookie>` +
      `<Extrinsic name="UserEmail">${escapeXml(user.email)}</Extrinsic>` +
      `<BrowserFormPost><URL>${escapeXml(returnUrl)}</URL></BrowserFormPost>` +
      `<Contact role="endUser"><Name xml:lang="en">${escapeXml(user.name || user.email)}</Name><Email>${escapeXml(user.email)}</Email></Contact>` +
      `<SupplierSetup><URL>${escapeXml(setupUrl)}</URL></SupplierSetup>` +
      `</PunchOutSetupRequest></Request>`
  );
}

export type OrderLine = { lineNumber: number; supplierPartId: string | null; description: string; quantity: number; unitPrice: number; unit: string | null };

export function orderRequest(params: {
  credentials: Credentials;
  orderId: string;
  orderDate: Date;
  currency: string;
  total: number;
  billToName: string;
  shipTo?: string | null;
  comments?: string | null;
  // The promised delivery date, sent as each line's requestedDeliveryDate.
  deliveryDate?: Date | null;
  lines: OrderLine[];
}) {
  const money = (value: number) => `<Money currency="${escapeXml(params.currency)}">${value.toFixed(2)}</Money>`;
  const requested = params.deliveryDate ? ` requestedDeliveryDate="${params.deliveryDate.toISOString().slice(0, 10)}"` : '';
  const comments = [params.shipTo ? `Ship to: ${params.shipTo}` : '', params.comments ?? ''].filter(Boolean).join('\n');
  return envelope(
    header(params.credentials) +
      `<Request deploymentMode="production"><OrderRequest>` +
      `<OrderRequestHeader orderID="${escapeXml(params.orderId)}" orderDate="${params.orderDate.toISOString()}" type="new">` +
      `<Total>${money(params.total)}</Total>` +
      `<BillTo><Address addressID="billing"><Name xml:lang="en">${escapeXml(params.billToName)}</Name></Address></BillTo>` +
      (comments ? `<Comments xml:lang="en">${escapeXml(comments)}</Comments>` : '') +
      `</OrderRequestHeader>` +
      params.lines
        .map(
          (line) =>
            `<ItemOut quantity="${line.quantity}" lineNumber="${line.lineNumber}"${requested}>` +
            `<ItemID><SupplierPartID>${escapeXml(line.supplierPartId ?? `LINE-${line.lineNumber}`)}</SupplierPartID></ItemID>` +
            `<ItemDetail><UnitPrice>${money(line.unitPrice)}</UnitPrice><Description xml:lang="en">${escapeXml(line.description)}</Description>` +
            `<UnitOfMeasure>${escapeXml(line.unit || 'EA')}</UnitOfMeasure></ItemDetail>` +
            `</ItemOut>`
        )
        .join('') +
      `</OrderRequest></Request>`
  );
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => name === 'ItemIn',
});

type Node = Record<string, any>;
const text = (node: unknown): string => {
  if (node === undefined || node === null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node).trim();
  // Child elements first (e.g. <Description><ShortName>A4 paper</ShortName>500 sheets</Description>), then the element's own text.
  const n = node as Node;
  const children = Object.entries(n)
    .filter(([key]) => !key.startsWith('@_') && key !== '#text')
    .map(([, value]) => (Array.isArray(value) ? value.map(text).join(' ') : text(value)));
  return [...children, n['#text'] !== undefined ? String(n['#text']).trim() : '']
    .filter(Boolean)
    .join(' ');
};

export const parseXml = (xml: string): Node => parser.parse(xml);

/** The cXML status of an answer: code 200/201/204 is success. */
export function responseStatus(doc: Node) {
  const status = doc?.cXML?.Response?.Status;
  const code = Number(status?.['@_code'] ?? 0);
  return { ok: code >= 200 && code < 300, code, message: text(status) || status?.['@_text'] || '' };
}

export function parseSetupResponse(xml: string) {
  const doc = parseXml(xml);
  const status = responseStatus(doc);
  if (!status.ok) throw new Error(`The supplier refused the PunchOut request (${status.code || 'no status'}${status.message ? `: ${status.message}` : ''}).`);
  const url = text(doc?.cXML?.Response?.PunchOutSetupResponse?.StartPage?.URL);
  if (!url) throw new Error("The supplier's answer had no catalog address (StartPage URL).");
  return { startUrl: url };
}

export function parseOrderMessage(xml: string): { buyerCookie: string; items: CartItem[] } {
  const doc = parseXml(xml);
  const message = doc?.cXML?.Message?.PunchOutOrderMessage;
  if (!message) throw new Error('This is not a cXML PunchOutOrderMessage.');
  const items = ((message.ItemIn as Node[] | undefined) ?? []).map<CartItem>((item) => {
    const detail = item.ItemDetail ?? {};
    const money = detail.UnitPrice?.Money;
    return {
      supplierPartId: text(item.ItemID?.SupplierPartID) || null,
      description: text(detail.Description) || text(item.ItemID?.SupplierPartID) || 'Catalog item',
      quantity: Number(item['@_quantity'] ?? 1) || 1,
      unitPrice: Number(text(money)) || 0,
      currency: money?.['@_currency'] ?? null,
      unit: text(detail.UnitOfMeasure) || null,
    };
  });
  return { buyerCookie: text(message.BuyerCookie), items };
}
