// usage: split-pdf <plan.json> <out dir> — plan rows {source, page (from 1), name}; writes one PDF per row.
import PDFKit
import Foundation
let args = CommandLine.arguments
let rows = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: args[1]))) as! [[String: Any]]
var cache: [String: PDFDocument] = [:]
for row in rows {
  let source = row["source"] as! String
  if cache[source] == nil { cache[source] = PDFDocument(url: URL(fileURLWithPath: source))! }
  let out = PDFDocument(); out.insert(cache[source]!.page(at: (row["page"] as! Int) - 1)!.copy() as! PDFPage, at: 0)
  precondition(out.write(to: URL(fileURLWithPath: "\(args[2])/\(row["name"] as! String)")))
}
print("wrote", rows.count)
