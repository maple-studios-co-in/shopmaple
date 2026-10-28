"use client";
import {
  categoryPageSlugs,
  type CategoryPageContent,
  type CategorySectionContent,
} from "@shopmaple/contracts";
import { resolveCategoryPageContent } from "@/lib/category-content-defaults";
import { SortableList, moveItem } from "./sortable-list";

function TextField({
  label,
  value,
  onChange,
  multiline = false,
  maxLength = 160,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  maxLength?: number;
}) {
  const props = {
    "aria-label": label,
    value,
    maxLength,
    onInput: (event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.currentTarget.value),
  };
  return (
    <label className="admin-field">
      <span>{label}</span>
      {multiline ? (
        <textarea {...props} rows={4} />
      ) : (
        <input {...props} type="text" />
      )}
    </label>
  );
}

export function CategoryFields({
  value,
  onChange,
}: {
  value: CategoryPageContent[];
  onChange: (value: CategoryPageContent[]) => void;
}) {
  function update(page: CategoryPageContent) {
    onChange(
      value.some((item) => item.slug === page.slug)
        ? value.map((item) => (item.slug === page.slug ? page : item))
        : [...value, page],
    );
  }
  return (
    <div>
      <h2>Category pages</h2>
      <p>
        Edit the Sofas, Tables, and Chairs pages. Changes become public when the
        draft is published. Campaign copy is managed in Campaigns.
      </p>
      {categoryPageSlugs.map((slug) => {
        const page = resolveCategoryPageContent(slug, value);
        const label = slug[0]!.toUpperCase() + slug.slice(1);
        function sectionUpdate(
          key: CategorySectionContent["key"],
          patch: Partial<CategorySectionContent>,
        ) {
          update({
            ...page,
            sections: page.sections.map((section) =>
              section.key === key ? { ...section, ...patch } : section,
            ),
          });
        }
        function move(index: number, offset: number) {
          const next = index + offset;
          if (next < 0 || next >= page.sections.length) return;
          update({ ...page, sections: moveItem(page.sections, index, next) });
        }
        return (
          <details key={slug} open={slug === "sofas"}>
            <summary>{label}</summary>
            <section aria-label={`${label} page content`}>
              <div className="admin-fields">
                <TextField
                  label={`${label} title`}
                  value={page.title}
                  onChange={(title) => update({ ...page, title })}
                />
                <TextField
                  label={`${label} introduction`}
                  value={page.introduction}
                  maxLength={8000}
                  multiline
                  onChange={(introduction) => update({ ...page, introduction })}
                />
              </div>
              <h3>Sections</h3>
              <SortableList
                as="div"
                rowAs="div"
                className="admin-sortable-blocks"
                items={page.sections}
                getKey={(section) => section.key}
                getLabel={(section) => `${label} ${section.key}`}
                onReorder={(sections) => update({ ...page, sections })}
                renderItem={(section, index, { handle }) => (
                  <>
                    {handle}
                    <details>
                  <summary>
                    {section.key.replaceAll("-", " ")}
                    {section.enabled ? "" : " (hidden)"}
                  </summary>
                  <div className="admin-actions">
                    <label className="admin-check">
                      <input
                        type="checkbox"
                        aria-label={`Show ${label} ${section.key}`}
                        checked={section.enabled}
                        onChange={(event) =>
                          sectionUpdate(section.key, {
                            enabled: event.currentTarget.checked,
                          })
                        }
                      />
                      Show section
                    </label>
                    <button
                      type="button"
                      aria-label={`Move ${label} ${section.key} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${label} ${section.key} down`}
                      disabled={index === page.sections.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      Move down
                    </button>
                  </div>
                  <div className="admin-fields">
                    {section.heading !== undefined && (
                      <TextField
                        label={`${label} ${section.key} heading`}
                        value={section.heading}
                        onChange={(heading) =>
                          sectionUpdate(section.key, { heading })
                        }
                      />
                    )}
                    {section.eyebrow !== undefined && (
                      <TextField
                        label={`${label} ${section.key} eyebrow`}
                        value={section.eyebrow}
                        onChange={(eyebrow) =>
                          sectionUpdate(section.key, { eyebrow })
                        }
                      />
                    )}
                    {section.items?.map((item) => (
                      <div key={item.key}>
                        <TextField
                          label={`${label} ${item.key} label`}
                          value={item.title}
                          onChange={(title) =>
                            sectionUpdate(section.key, {
                              items: section.items!.map((current) =>
                                current.key === item.key
                                  ? { ...current, title }
                                  : current,
                              ),
                            })
                          }
                        />
                        {item.body !== undefined && (
                          <TextField
                            label={`${label} ${item.key} body`}
                            value={item.body}
                            maxLength={600}
                            multiline
                            onChange={(body) =>
                              sectionUpdate(section.key, {
                                items: section.items!.map((current) =>
                                  current.key === item.key
                                    ? { ...current, body }
                                    : current,
                                ),
                              })
                            }
                          />
                        )}
                      </div>
                    ))}
                  </div>
                    </details>
                  </>
                )}
              />
            </section>
          </details>
        );
      })}
    </div>
  );
}
