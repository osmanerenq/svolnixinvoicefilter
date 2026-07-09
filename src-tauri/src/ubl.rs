use std::path::Path;
use lopdf::{Document, Object};
use crate::types::Invoice;

fn find_child_by_name<'a, 'input>(node: roxmltree::Node<'a, 'input>, name: &str) -> Option<roxmltree::Node<'a, 'input>> {
    node.children().find(|n| n.tag_name().name() == name)
}

fn find_descendant_by_name<'a, 'input>(node: roxmltree::Node<'a, 'input>, name: &str) -> Option<roxmltree::Node<'a, 'input>> {
    if node.tag_name().name() == name {
        return Some(node);
    }
    for child in node.children() {
        if let Some(found) = find_descendant_by_name(child, name) {
            return Some(found);
        }
    }
    None
}

fn collect_descendants_by_name<'a, 'input>(
    node: roxmltree::Node<'a, 'input>,
    name: &str,
    matches: &mut Vec<roxmltree::Node<'a, 'input>>,
) {
    if node.tag_name().name() == name {
        matches.push(node);
    } else {
        for child in node.children() {
            collect_descendants_by_name(child, name, matches);
        }
    }
}

fn parse_party(party_node: roxmltree::Node) -> (String, String, String) {
    let mut name = String::new();
    let mut vkn = String::new();
    let mut city = String::new();

    // 1. Name
    if let Some(party_name_node) = find_descendant_by_name(party_node, "PartyName") {
        if let Some(name_node) = find_child_by_name(party_name_node, "Name") {
            name = name_node.text().unwrap_or_default().trim().to_string();
        }
    }
    if name.is_empty() {
        if let Some(person_node) = find_descendant_by_name(party_node, "Person") {
            let first = find_child_by_name(person_node, "FirstName").and_then(|n| n.text()).unwrap_or_default().trim();
            let family = find_child_by_name(person_node, "FamilyName").and_then(|n| n.text()).unwrap_or_default().trim();
            name = format!("{} {}", first, family).trim().to_string();
        }
    }
    if name.is_empty() {
        if let Some(tax_scheme) = find_descendant_by_name(party_node, "PartyTaxScheme") {
            if let Some(reg_name) = find_child_by_name(tax_scheme, "RegistrationName") {
                name = reg_name.text().unwrap_or_default().trim().to_string();
            }
        }
    }

    // 2. VKN/TCKN
    for child in party_node.children() {
        if child.tag_name().name() == "PartyIdentification" {
            if let Some(id_node) = find_child_by_name(child, "ID") {
                let id_val = id_node.text().unwrap_or_default().trim().to_string();
                if !id_val.is_empty() {
                    vkn = id_val;
                }
            }
        }
    }

    // 3. City
    if let Some(addr_node) = find_descendant_by_name(party_node, "PostalAddress") {
        if let Some(city_node) = find_child_by_name(addr_node, "CityName") {
            city = city_node.text().unwrap_or_default().trim().to_string();
        }
    }

    (name, vkn, city)
}

fn get_description(root: roxmltree::Node) -> String {
    let mut items = Vec::new();
    collect_descendants_by_name(root, "InvoiceLine", &mut items);

    let mut names = Vec::new();
    for line in items {
        if let Some(item_node) = find_child_by_name(line, "Item") {
            if let Some(name_node) = find_child_by_name(item_node, "Name") {
                if let Some(t) = name_node.text() {
                    let trimmed = t.trim();
                    if !trimmed.is_empty() {
                        names.push(trimmed.to_string());
                    }
                }
            }
        }
    }
    names.join(", ")
}

pub fn parse_ubl_pdf(path: &str) -> Option<Invoice> {
    let doc = Document::load(path).ok()?;
    let mut xml_content = None;

    for (_id, object) in &doc.objects {
        if let Object::Stream(stream) = object {
            if let Ok(data) = stream.decompressed_content() {
                let text = String::from_utf8_lossy(&data);
                if text.contains("<Invoice") && text.contains("urn:oasis:names:specification:ubl:schema:xsd:") {
                    xml_content = Some(text.into_owned());
                    break;
                }
            }
        }
    }

    let xml = xml_content?;
    let doc = roxmltree::Document::parse(&xml).ok()?;
    let root = doc.root_element();

    let invoice_number = find_child_by_name(root, "ID").and_then(|n| n.text()).unwrap_or_default().trim().to_string();
    let date = find_child_by_name(root, "IssueDate").and_then(|n| n.text()).unwrap_or_default().trim().to_string();

    // Convert Date from YYYY-MM-DD to DD.MM.YYYY
    let date = if date.len() == 10 && date.contains('-') {
        let parts: Vec<&str> = date.split('-').collect();
        if parts.len() == 3 {
            format!("{}.{}.{}", parts[2], parts[1], parts[0])
        } else {
            date
        }
    } else {
        date
    };

    let mut amount = 0.0;
    if let Some(total_node) = find_descendant_by_name(root, "LegalMonetaryTotal") {
        if let Some(payable_node) = find_child_by_name(total_node, "PayableAmount") {
            if let Some(t) = payable_node.text() {
                amount = t.parse::<f64>().unwrap_or(0.0);
            }
        }
    }

    let mut issuer = String::new();
    let mut tax_number = String::new();
    let mut location = String::new();
    if let Some(supplier_party) = find_descendant_by_name(root, "AccountingSupplierParty") {
        if let Some(party) = find_child_by_name(supplier_party, "Party") {
            let (name, vkn, city) = parse_party(party);
            issuer = name;
            tax_number = vkn;
            location = city;
        }
    }

    let mut recipient = String::new();
    if let Some(customer_party) = find_descendant_by_name(root, "AccountingCustomerParty") {
        if let Some(party) = find_child_by_name(customer_party, "Party") {
            let (name, _, _) = parse_party(party);
            recipient = name;
        }
    }

    let description = get_description(root);

    let filename = Path::new(path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let id = uuid::Uuid::new_v4().to_string();

    // Extract raw PDF text if possible for AI queries
    let raw_text = match pdf_extract::extract_text(path) {
        Ok(t) => t,
        Err(_) => xml.clone(), // fallback to XML content itself
    };

    Some(Invoice {
        id,
        filename,
        full_path: path.to_string(),
        issuer,
        recipient,
        amount,
        date,
        location,
        invoice_number,
        tax_number,
        description,
        raw_text,
        ai_parsed: false,
    })
}
