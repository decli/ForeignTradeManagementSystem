-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'sales',
    "team" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'self',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "contact" TEXT,
    "creditLevel" TEXT NOT NULL DEFAULT 'B',
    "sinosureLimitCents" BIGINT NOT NULL DEFAULT 0,
    "sinosureUsedCents" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "salesId" TEXT,
    CONSTRAINT "Customer_salesId_fkey" FOREIGN KEY ("salesId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SellerEntity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "taxNo" TEXT,
    "bank" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Pi" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "piNo" TEXT NOT NULL,
    "signedOn" DATETIME,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "amountCents" BIGINT NOT NULL DEFAULT 0,
    "product" TEXT,
    "destination" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "customerId" TEXT NOT NULL,
    "salesId" TEXT,
    "sellerEntityId" TEXT,
    CONSTRAINT "Pi_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Pi_salesId_fkey" FOREIGN KEY ("salesId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Pi_sellerEntityId_fkey" FOREIGN KEY ("sellerEntityId") REFERENCES "SellerEntity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderCosting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "piId" TEXT NOT NULL,
    "purchaseCostCents" BIGINT NOT NULL DEFAULT 0,
    "freightCents" BIGINT NOT NULL DEFAULT 0,
    "customsCents" BIGINT NOT NULL DEFAULT 0,
    "bankCents" BIGINT NOT NULL DEFAULT 0,
    "otherCents" BIGINT NOT NULL DEFAULT 0,
    "receivableCents" BIGINT NOT NULL DEFAULT 0,
    "payableCents" BIGINT NOT NULL DEFAULT 0,
    "profitRateBp" INTEGER NOT NULL DEFAULT 0,
    "reviewState" TEXT NOT NULL DEFAULT 'draft',
    "settleState" TEXT NOT NULL DEFAULT '未完结',
    "costEstimated" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderCosting_piId_fkey" FOREIGN KEY ("piId") REFERENCES "Pi" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchNo" TEXT NOT NULL,
    "batchLabel" TEXT,
    "country" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT '海运',
    "fcl" BOOLEAN NOT NULL DEFAULT true,
    "containerNo" TEXT,
    "carrier" TEXT,
    "pod" TEXT,
    "releaseState" TEXT NOT NULL DEFAULT '未放行',
    "team" TEXT,
    "latestNote" TEXT,
    "latestNoteOn" DATETIME,
    "hasTodo" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "piId" TEXT,
    "salesId" TEXT,
    CONSTRAINT "Shipment_piId_fkey" FOREIGN KEY ("piId") REFERENCES "Pi" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Shipment_salesId_fkey" FOREIGN KEY ("salesId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShipmentMilestone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "plannedOn" DATETIME,
    "actualOn" DATETIME,
    CONSTRAINT "ShipmentMilestone_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShipmentNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "happenedOn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShipmentNote_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShipmentNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaxInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "declareMonth" TEXT NOT NULL,
    "batch" TEXT NOT NULL DEFAULT '001',
    "buyer" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "grossCents" BIGINT NOT NULL DEFAULT 0,
    "netCents" BIGINT NOT NULL DEFAULT 0,
    "taxCents" BIGINT NOT NULL DEFAULT 0,
    "exportedOn" DATETIME,
    "customsNo" TEXT,
    "customsUsdCents" BIGINT NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "piId" TEXT,
    "sellerEntityId" TEXT,
    CONSTRAINT "TaxInvoice_piId_fkey" FOREIGN KEY ("piId") REFERENCES "Pi" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TaxInvoice_sellerEntityId_fkey" FOREIGN KEY ("sellerEntityId") REFERENCES "SellerEntity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "base" TEXT NOT NULL DEFAULT 'USD',
    "quote" TEXT NOT NULL DEFAULT 'CNY',
    "kind" TEXT NOT NULL DEFAULT 'market',
    "rateE6" INTEGER NOT NULL,
    "asOf" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE INDEX "Customer_salesId_idx" ON "Customer"("salesId");

-- CreateIndex
CREATE INDEX "Customer_country_idx" ON "Customer"("country");

-- CreateIndex
CREATE UNIQUE INDEX "SellerEntity_name_key" ON "SellerEntity"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Pi_piNo_key" ON "Pi"("piNo");

-- CreateIndex
CREATE INDEX "Pi_customerId_idx" ON "Pi"("customerId");

-- CreateIndex
CREATE INDEX "Pi_salesId_idx" ON "Pi"("salesId");

-- CreateIndex
CREATE INDEX "Pi_status_idx" ON "Pi"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OrderCosting_piId_key" ON "OrderCosting"("piId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_batchNo_key" ON "Shipment"("batchNo");

-- CreateIndex
CREATE INDEX "Shipment_piId_idx" ON "Shipment"("piId");

-- CreateIndex
CREATE INDEX "Shipment_salesId_idx" ON "Shipment"("salesId");

-- CreateIndex
CREATE INDEX "Shipment_releaseState_idx" ON "Shipment"("releaseState");

-- CreateIndex
CREATE INDEX "Shipment_archived_idx" ON "Shipment"("archived");

-- CreateIndex
CREATE INDEX "ShipmentMilestone_shipmentId_idx" ON "ShipmentMilestone"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentMilestone_shipmentId_kind_key" ON "ShipmentMilestone"("shipmentId", "kind");

-- CreateIndex
CREATE INDEX "ShipmentNote_shipmentId_happenedOn_idx" ON "ShipmentNote"("shipmentId", "happenedOn");

-- CreateIndex
CREATE INDEX "TaxInvoice_declareMonth_idx" ON "TaxInvoice"("declareMonth");

-- CreateIndex
CREATE INDEX "TaxInvoice_piId_idx" ON "TaxInvoice"("piId");

-- CreateIndex
CREATE INDEX "TaxInvoice_sellerEntityId_idx" ON "TaxInvoice"("sellerEntityId");

-- CreateIndex
CREATE INDEX "FxRate_base_quote_kind_asOf_idx" ON "FxRate"("base", "quote", "kind", "asOf");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");
