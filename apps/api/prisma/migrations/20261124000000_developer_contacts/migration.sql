CREATE TABLE "developer_contacts" (
    "branch_id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "mobile" TEXT NOT NULL DEFAULT '',
    "facebook_url" TEXT NOT NULL DEFAULT '',
    "website_url" TEXT NOT NULL DEFAULT '',
    "support_hours" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "developer_contacts_pkey" PRIMARY KEY ("branch_id")
);
