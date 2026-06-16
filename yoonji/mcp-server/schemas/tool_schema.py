from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


ShoppingSort = Literal["sim", "date", "asc", "dsc"]


class ToolError(BaseModel):
    code: str
    message: str
    details: dict | None = None


class SearchProductsRequest(BaseModel):
    query: str = Field(min_length=1, max_length=200)
    display: int = Field(default=10, ge=1, le=100)
    sort: ShoppingSort = "sim"

    @field_validator("query")
    @classmethod
    def normalize_query(cls, value: str) -> str:
        normalized = " ".join(value.strip().split())
        if not normalized:
            raise ValueError("query must not be blank")
        return normalized


class ProductCandidate(BaseModel):
    title: str
    normalized_title: str
    link: str
    image: str | None = None
    lprice: int | None = None
    hprice: int | None = None
    mall_name: str | None = None
    product_id: str | None = None
    product_type: str | None = None
    maker: str | None = None
    brand: str | None = None
    category1: str | None = None
    category2: str | None = None
    category3: str | None = None
    category4: str | None = None
    is_official_store_url: bool = True


class SearchProductsResponse(BaseModel):
    ok: bool
    query: str
    total: int = 0
    display: int = 0
    returned_count: int = 0
    discarded_count: int = 0
    candidates: list[ProductCandidate] = Field(default_factory=list)
    error: ToolError | None = None


class ProductMetadataRequest(BaseModel):
    product_url: str = Field(min_length=1, max_length=1000)

    @field_validator("product_url")
    @classmethod
    def normalize_product_url(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("product_url must not be blank")
        return normalized


class ProductMetadata(BaseModel):
    product_url: str
    final_url: str | None = None
    title: str | None = None
    description: str | None = None
    image: str | None = None
    price: int | None = None
    availability: str | None = None


class ProductMetadataResponse(BaseModel):
    ok: bool
    metadata: ProductMetadata | None = None
    error: ToolError | None = None
