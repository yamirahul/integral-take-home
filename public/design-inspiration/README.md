# Design Inspiration

This folder contains design references and inspiration for the Intake Review System.

## These mockups are not the spec

They were produced for an earlier iteration of this exercise and have knowingly drifted from
the current requirements. The root `README.md` and `prisma/schema.prisma` are the source of
truth — where they disagree with these images, follow the docs and the schema.

Known differences:

- `login-page.png` labels the submitter role **Client**; the schema's role is `PATIENT`.
- `reviewer-dashboard.png` refers to "client intake submissions" and a "Client Name" column.
- `submit-intake-form.png` includes a required **Full Address** field that is not in the
  schema, and none of the mockups show the document-upload affordance that the challenge
  requires.

They're still useful for layout, density, and general visual tone. Feel free to ignore them
entirely and implement your own design.

## Accessing Images

Images in this folder are accessible at:

```
http://localhost:3000/design-inspiration/[filename]
```

For example: `http://localhost:3000/design-inspiration/login-page.png`
