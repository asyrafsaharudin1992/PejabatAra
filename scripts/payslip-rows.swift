// usage: payslip-rows <Infotech payslip PDFs...> > rows.json — for every page: its text, the designation, and the lines of the Earnings and Deductions
// columns, each read by where it is printed (the text order of these files is scrambled).
import PDFKit
import Foundation
typealias Mark = (c: String, r: CGRect)
// The characters of one printed line, left to right, with a space where there is a gap.
func join(_ marks: [Mark]) -> String {
  var value = ""; var last: CGFloat = 0
  for mark in marks.sorted(by: { $0.r.minX < $1.r.minX }) { if !value.isEmpty && mark.r.minX - last > 1.6 { value += " " }; value += mark.c; last = mark.r.maxX }
  return value
}
// Groups characters into printed lines, top first.
func lines(_ marks: [Mark]) -> [[Mark]] {
  var out: [[Mark]] = []
  for mark in marks.sorted(by: { $0.r.midY > $1.r.midY }) { if let first = out.last?.first, abs(first.r.midY - mark.r.midY) < 3.5 { out[out.count - 1].append(mark) } else { out.append([mark]) } }
  return out
}
var out: [[String: Any]] = []
for path in CommandLine.arguments.dropFirst() {
  let document = PDFDocument(url: URL(fileURLWithPath: path))!
  for index in 0..<document.pageCount {
    let page = document.page(at: index)!
    let text = (page.string ?? "") as NSString
    var all: [Mark] = []
    for at in 0..<min(text.length, page.numberOfCharacters) { let c = text.substring(with: NSRange(location: at, length: 1)); if !c.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { all.append((c, page.characterBounds(at: at))) } }
    func box(_ label: String, _ from: Int = 0) -> CGRect? {
      let range = text.range(of: label, options: [], range: NSRange(location: from, length: text.length - from))
      if range.location == NSNotFound { return nil }
      var found = CGRect.null
      for at in range.location..<(range.location + range.length) { let r = page.characterBounds(at: at); if r.width > 0 { found = found.union(r) } }
      return found
    }
    var row: [String: Any] = ["file": (path as NSString).lastPathComponent, "page": index + 1, "text": text as String]
    if let earn = box("EARNINGS DESCRIPTION"), let less = box("DEDUCTIONS DESCRIPTION"), let total = box("Total Earnings"), let designation = box("Designation"), let join_ = box("Join Date") {
      // Designation: right of its label's colon, left of the Join Date column, above the table (it may take two lines).
      let labelRight = designation.maxX + 4
      let name = all.filter { $0.r.minX > labelRight && $0.r.maxX < join_.minX - 2 && $0.r.midY < designation.midY + 4 && $0.r.midY > earn.maxY + 3 }
      row["designation"] = lines(name).map { join($0) }.joined(separator: " ").replacingOccurrences(of: "^\\s*:\\s*", with: "", options: .regularExpression)
      let body = all.filter { $0.r.midY < earn.minY - 1 && $0.r.midY > total.maxY + 1 }
      // Each column: the description, then its amount at the column's right edge.
      func column(_ marks: [Mark]) -> [[String]] {
        lines(marks).map { line in
          let whole = join(line)
          if let match = whole.range(of: "\\s(-?[\\d,]+\\.\\d\\d)$", options: .regularExpression), !whole.contains("=") { return [String(whole[..<match.lowerBound]), String(whole[match]).trimmingCharacters(in: .whitespaces)] }
          return [whole, ""]
        }
      }
      row["earnings"] = column(body.filter { $0.r.midX < less.minX - 3 })
      row["deductions"] = column(body.filter { $0.r.midX >= less.minX - 3 })
    }
    out.append(row)
  }
}
FileHandle.standardOutput.write(try! JSONSerialization.data(withJSONObject: out))
