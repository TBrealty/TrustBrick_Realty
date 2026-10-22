import { View } from "react-native";
import { FormCards, FormChips, FormDate, FormSection, FormSelect, FormText, FormTime, FormToggle } from "@/components/form";
import type { FieldSpec, Section, Values } from "@/partner/property-fields";

/** Lays out a step's sections from their field specs (partner/property-fields). */
export function SpecForm({ sections, values, errors, onChange }: { sections: Section[]; values: Values; errors: Record<string, string>; onChange: (name: string, value: string | boolean) => void }) {
  return (
    <View style={{ gap: 32 }}>
      {sections.map((s) => {
        const fields = s.fields.filter((f) => !f.visible || f.visible(values));
        if (!fields.length) return null;
        return (
          <FormSection key={s.title} title={s.title} description={s.description}>
            {fields.map((f) => (
              <SpecField key={`${f.name}-${f.label}`} field={f} value={values[f.name]} error={errors[f.name]} onChange={(v) => onChange(f.name, v)} />
            ))}
          </FormSection>
        );
      })}
    </View>
  );
}

function SpecField({ field: f, value, error, onChange }: { field: FieldSpec; value: string | boolean | undefined; error?: string; onChange: (value: string | boolean) => void }) {
  const text = typeof value === "string" ? value : "";
  const common = { label: f.label, required: f.required, error, hint: f.hint };
  switch (f.kind) {
    case "text":
    case "multiline":
      return <FormText {...common} value={text} onChangeText={onChange} placeholder={f.placeholder} maxLength={f.maxLength} multiline={f.kind === "multiline"} autoCapitalize="sentences" />;
    case "number":
    case "decimal":
    case "money":
      return (
        <FormText
          {...common}
          value={text}
          onChangeText={(v) => onChange(v.replace(f.kind === "number" ? /[^0-9-]/g : /[^0-9.]/g, ""))}
          placeholder={f.placeholder}
          prefix={f.kind === "money" ? "₹" : undefined}
          suffix={f.suffix}
          keyboardType={f.kind === "number" ? "number-pad" : "decimal-pad"}
        />
      );
    case "select":
      return <FormSelect {...common} value={text} options={f.options} onChange={onChange} />;
    case "chips":
      return <FormChips {...common} value={text} options={f.options} onChange={onChange} />;
    case "cards":
      return <FormCards label={f.label} value={text} options={f.options} onChange={onChange} error={error} />;
    case "toggle":
      return <FormToggle label={f.label} value={value === true} onChange={onChange} hint={f.hint} error={error} />;
    case "date":
      return <FormDate {...common} value={text} onChange={onChange} />;
    case "time":
      return <FormTime {...common} value={text} onChange={onChange} />;
  }
}
