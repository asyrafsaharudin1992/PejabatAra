// usage: payslip-text <Infotech payslip PDFs...> > pages.json — the text of every page, with the figures printed on the AL and ML leave lines.
import PDFKit
import Foundation
var out: [[String: Any]] = []
for path in CommandLine.arguments.dropFirst() {
  let document = PDFDocument(url: URL(fileURLWithPath: path))!
  for index in 0..<document.pageCount {
    let page = document.page(at: index)!
    var row: [String: Any] = ["file": (path as NSString).lastPathComponent, "page": index + 1, "text": page.string ?? ""]
    // Every character with its place, so the figures on a line can be read by position (the text order of these files is scrambled).
    let text = (page.string ?? "") as NSString
    var places: [(String, CGRect)] = []
    for at in 0..<min(text.length, page.numberOfCharacters) { places.append((text.substring(with: NSRange(location: at, length: 1)), page.characterBounds(at: at))) }
    for (key, label) in [("al", "AL/Bal/YTD"), ("ml", "ML/Bal/YTD")] {
      let range = text.range(of: label)
      if range.location == NSNotFound { continue }
      var box = CGRect.null
      for at in range.location..<(range.location + range.length) where at < places.count { box = box.union(places[at].1) }
      let line = places.filter { !$0.0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && abs($0.1.midY - box.midY) < 3.5 && $0.1.minX > box.maxX + 1 }.sorted { $0.1.minX < $1.1.minX }
      var value = ""; var last: CGFloat = 0
      for (character, place) in line { if !value.isEmpty && place.minX - last > 2 { value += " " }; value += character; last = place.maxX }
      row[key] = value
    }
    out.append(row)
  }
}
FileHandle.standardOutput.write(try! JSONSerialization.data(withJSONObject: out))
