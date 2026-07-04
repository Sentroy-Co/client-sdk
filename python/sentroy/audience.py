from __future__ import annotations

import urllib.parse
from typing import Any, Optional

from sentroy._http import _HttpClient
from sentroy.types import Contact, ContactList, ContactListResult


class AudienceListMembersScope:
    """Membership operations scoped to a single audience list."""

    def __init__(self, http: _HttpClient, list_id: str) -> None:
        self._http = http
        self._list_id = urllib.parse.quote(list_id, safe="")

    def list(self) -> list[Contact]:
        """List all contacts in this audience list."""
        data = self._http.get(f"/audience/lists/{self._list_id}/members")
        return [Contact.from_dict(c) for c in (data or [])]

    def add(self, contact_id: str) -> None:
        """Add a contact to the list by id."""
        self._http.post(
            f"/audience/lists/{self._list_id}/members",
            {"contactId": contact_id},
        )

    def remove(self, contact_id: str) -> None:
        """Remove a contact from the list. The contact record is preserved."""
        self._http.delete_with_body(
            f"/audience/lists/{self._list_id}/members",
            {"contactId": contact_id},
        )


class AudienceListsResource:
    """Audience list (grouping) CRUD."""

    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def list(self) -> list[ContactList]:
        """List every audience list in the company."""
        data = self._http.get("/audience/lists")
        return [ContactList.from_dict(x) for x in (data or [])]

    def get(self, id: str) -> ContactList:
        """Get a single audience list by id."""
        data = self._http.get(
            f"/audience/lists/{urllib.parse.quote(id, safe='')}"
        )
        return ContactList.from_dict(data)

    def create(
        self, *, name: str, description: Optional[str] = None
    ) -> ContactList:
        """Create a new audience list."""
        body: dict[str, Any] = {"name": name}
        if description is not None:
            body["description"] = description
        data = self._http.post("/audience/lists", body)
        return ContactList.from_dict(data)

    def delete(self, id: str) -> None:
        """Delete an audience list. Contacts stay in the company; only the
        grouping is removed."""
        self._http.delete(f"/audience/lists/{urllib.parse.quote(id, safe='')}")

    def members(self, list_id: str) -> AudienceListMembersScope:
        """Membership operations scoped to a list id."""
        return AudienceListMembersScope(self._http, list_id)


class AudienceContactsResource:
    """Company-wide contact records."""

    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def list(
        self,
        *,
        page: Optional[int] = None,
        limit: Optional[int] = None,
        status: Optional[str] = None,
        tags: Optional[list[str]] = None,
    ) -> ContactListResult:
        """Paginated list of contacts. Filter by ``status``
        (``active`` | ``unsubscribed`` | ``bounced``) or tag set; ``tags``
        are sent comma-joined over the wire."""
        query: dict[str, Any] = {}
        if page is not None:
            query["page"] = page
        if limit is not None:
            query["limit"] = limit
        if status:
            query["status"] = status
        if tags:
            query["tags"] = ",".join(tags)
        data = self._http.get("/audience/contacts", query or None)
        return ContactListResult.from_dict(data or {})

    def search(self, q: str) -> list[Contact]:
        """Email-prefix autocomplete. Capped server-side at 10 results —
        use ``list`` for paginated browsing."""
        data = self._http.get("/audience/contacts", {"q": q})
        return [Contact.from_dict(c) for c in (data or [])]

    def get(self, id: str) -> Contact:
        """Get a single contact by id."""
        data = self._http.get(
            f"/audience/contacts/{urllib.parse.quote(id, safe='')}"
        )
        return Contact.from_dict(data)

    def create(
        self,
        *,
        email: str,
        name: Optional[str] = None,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> Contact:
        """Create a contact. Defaults to status ``active``."""
        body: dict[str, Any] = {"email": email}
        if name is not None:
            body["name"] = name
        if tags is not None:
            body["tags"] = tags
        if metadata is not None:
            body["metadata"] = metadata
        data = self._http.post("/audience/contacts", body)
        return Contact.from_dict(data)

    def update(
        self,
        id: str,
        *,
        email: Optional[str] = None,
        name: Optional[str] = None,
        tags: Optional[list[str]] = None,
        status: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> Contact:
        """Patch any contact field. Pass ``status`` to mark
        unsubscribed/bounced."""
        body: dict[str, Any] = {}
        if email is not None:
            body["email"] = email
        if name is not None:
            body["name"] = name
        if tags is not None:
            body["tags"] = tags
        if status is not None:
            body["status"] = status
        if metadata is not None:
            body["metadata"] = metadata
        data = self._http.patch(
            f"/audience/contacts/{urllib.parse.quote(id, safe='')}", body
        )
        return Contact.from_dict(data)

    def delete(self, id: str) -> None:
        """Soft-delete: marks the contact ``unsubscribed``. The record stays
        so historical mail-log foreign keys keep resolving."""
        self._http.delete(
            f"/audience/contacts/{urllib.parse.quote(id, safe='')}"
        )


class AudienceResource:
    """Audience — contact lists and company-wide contacts."""

    lists: AudienceListsResource
    contacts: AudienceContactsResource

    def __init__(self, http: _HttpClient) -> None:
        self.lists = AudienceListsResource(http)
        self.contacts = AudienceContactsResource(http)
