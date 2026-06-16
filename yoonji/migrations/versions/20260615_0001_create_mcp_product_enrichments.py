"""create mcp product enrichments table

Revision ID: 20260615_0001
Revises:
Create Date: 2026-06-15
"""

from alembic import op
import sqlalchemy as sa


revision = "20260615_0001"
down_revision = None
branch_labels = None
depends_on = None


product_enrichment_status = sa.Enum(
    "REQUESTED",
    "PROCESSING",
    "COMPLETED",
    "FAILED",
    name="product_enrichment_status",
    native_enum=False,
)

product_match_status = sa.Enum(
    "VERIFIED",
    "CANDIDATES_ONLY",
    "NO_MATCH",
    name="product_match_status",
    native_enum=False,
)


def upgrade() -> None:
    op.create_table(
        "mcp_product_enrichments",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("post_id", sa.BigInteger(), nullable=False),
        sa.Column("status", product_enrichment_status, nullable=False),
        sa.Column("match_status", product_match_status, nullable=False),
        sa.Column("query_text", sa.Text(), nullable=False),
        sa.Column("confidence_score", sa.Float(), nullable=True),
        sa.Column("matched_product_json", sa.JSON(), nullable=True),
        sa.Column("candidates_json", sa.JSON(), nullable=True),
        sa.Column("match_reasons_json", sa.JSON(), nullable=True),
        sa.Column("source_url", sa.String(length=1000), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_mcp_product_enrichments_id"),
        "mcp_product_enrichments",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_mcp_product_enrichments_match_status"),
        "mcp_product_enrichments",
        ["match_status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_mcp_product_enrichments_post_id"),
        "mcp_product_enrichments",
        ["post_id"],
        unique=False,
    )
    op.create_index(
        "ix_mcp_product_enrichments_post_fetched",
        "mcp_product_enrichments",
        ["post_id", "fetched_at"],
        unique=False,
    )
    op.create_index(
        "ix_mcp_product_enrichments_post_status",
        "mcp_product_enrichments",
        ["post_id", "status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_mcp_product_enrichments_status"),
        "mcp_product_enrichments",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_mcp_product_enrichments_status"),
        table_name="mcp_product_enrichments",
    )
    op.drop_index(
        "ix_mcp_product_enrichments_post_status",
        table_name="mcp_product_enrichments",
    )
    op.drop_index(
        "ix_mcp_product_enrichments_post_fetched",
        table_name="mcp_product_enrichments",
    )
    op.drop_index(
        op.f("ix_mcp_product_enrichments_post_id"),
        table_name="mcp_product_enrichments",
    )
    op.drop_index(
        op.f("ix_mcp_product_enrichments_match_status"),
        table_name="mcp_product_enrichments",
    )
    op.drop_index(
        op.f("ix_mcp_product_enrichments_id"),
        table_name="mcp_product_enrichments",
    )
    op.drop_table("mcp_product_enrichments")
