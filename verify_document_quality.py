import os
import docx

def verify():
    doc_path = r"c:\Users\Asus\Downloads\r_pro\BEYOND_BORDERS_MINI_PROJECT_REPORT_CSD2008.docx"
    assert os.path.exists(doc_path), "File does not exist!"
    doc = docx.Document(doc_path)
    
    print("=== 1. VERIFY SECTIONS ===")
    assert len(doc.sections) == 2, f"Expected 2 sections, got {len(doc.sections)}"
    s0, s1 = doc.sections[0], doc.sections[1]
    
    s0_borders = s0._sectPr.xpath('./w:pgBorders')
    print("Section 0 pgBorders present:", len(s0_borders) > 0)
    assert len(s0_borders) > 0, "Section 0 must have pgBorders!"
    
    s0_num = s0._sectPr.xpath('./w:pgNumType')
    print("Section 0 pgNumType:", [n.attrib for n in s0_num])
    assert s0_num and s0_num[0].attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}fmt') == 'lowerRoman'
    
    s1_num = s1._sectPr.xpath('./w:pgNumType')
    print("Section 1 pgNumType:", [n.attrib for n in s1_num])
    assert s1_num and s1_num[0].attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}start') == '1'
    
    s1_hdr_bdr = s1.header.paragraphs[1]._p.xpath('.//w:pBdr')
    print("Section 1 header border rule present:", len(s1_hdr_bdr) > 0)
    assert len(s1_hdr_bdr) > 0, "Section 1 must have header decorative rule!"
    
    print("\n=== 2. VERIFY STUDENT NAMES & ROLL NUMBERS ===")
    required_students = [
        ("B.NANDA KUMAR REDDY", "20241CSD0022"),
        ("P. MANOHAR REDDY", "20241CSD0041"),
        ("C. TEJASHREE REDDY", "20241CSD0023"),
        ("DILEEP GOWDA R N", "20241CSD0007")
    ]
    full_text = "\n".join(p.text for p in doc.paragraphs)
    for name, roll in required_students:
        assert name in full_text, f"Missing student name: {name}"
        assert roll in full_text, f"Missing roll number: {roll}"
        print(f"Verified: {name} - {roll}")
        
    print("\n=== 3. VERIFY GUIDE & INSTITUTION ===")
    assert "MEENA KUMARI K S" in full_text
    assert "PRESIDENCY UNIVERSITY" in full_text
    assert "DECEMBER 2026" in full_text
    print("Verified Guide, University, and Year.")
    
    print("\n=== 4. VERIFY CHAPTER STRUCTURE & SEQUENCING ===")
    expected_order = [
        "CERTIFICATE",
        "ABSTRACT",
        "TABLE OF CONTENTS",
        "LIST OF TABLES",
        "LIST OF FIGURES",
        "CHAPTER-1",
        "CHAPTER-2",
        "CHAPTER-3",
        "CHAPTER-4",
        "CHAPTER-5",
        "CHAPTER-6",
        "REFERENCES",
        "APPENDIX-A"
    ]
    last_idx = -1
    for heading in expected_order:
        found_idx = -1
        for i, p in enumerate(doc.paragraphs):
            if heading in p.text:
                found_idx = i
                break
        assert found_idx != -1, f"Missing heading: {heading}"
        assert found_idx > last_idx, f"Heading {heading} at index {found_idx} appeared out of order (previous was {last_idx})!"
        print(f"Heading '{heading}' verified at paragraph {found_idx}.")
        last_idx = found_idx
        
    print("\n=== 5. VERIFY CHAPTER 5, 6, REFERENCES & APPENDIX DETAILS ===")
    assert "5.1 RESULTS OBTAINED" in full_text
    assert "5.2 RESULT SUMMARY" in full_text
    assert "5.3 DISCUSSION" in full_text
    assert "5.4 KEY FINDINGS" in full_text
    assert "5.5 PRACTICAL APPLICATIONS" in full_text
    assert "6.1 CONCLUSION" in full_text
    assert "6.2 LIMITATIONS" in full_text
    assert "6.3 FUTURE ENHANCEMENT" in full_text
    assert "[1] S. Chakraborty" in full_text and "Base Paper" in full_text
    assert "[10] United Nations" in full_text
    assert "Goal 8: Decent Work and Economic Growth" in full_text
    assert "Goal 9: Industry, Innovation, and Infrastructure" in full_text
    assert "Goal 10: Reduced Inequalities" in full_text
    assert "Goal 7: Affordable and Clean Energy" in full_text
    assert "Goal 3: Good Health and Well-Being" in full_text
    print("Verified all Chapter 5, Chapter 6, References [1-10], and Appendix-A SDG goals.")
    
    print("\n=== 6. VERIFY TABLES & ROW CONSTRAINTS ===")
    print(f"Total Tables: {len(doc.tables)}")
    for t_idx, tbl in enumerate(doc.tables):
        for r_idx, r in enumerate(tbl.rows):
            cantSplit = r._tr.xpath('./w:trPr/w:cantSplit')
            assert len(cantSplit) > 0, f"Table {t_idx} row {r_idx} missing cantSplit!"
        total_width = sum(c.width.inches for c in tbl.rows[0].cells if c.width)
        print(f"Table {t_idx} ({len(tbl.rows)}x{len(tbl.columns)}): cantSplit=OK, width={total_width:.2f} in <= 6.15 in")
        assert total_width <= 6.15, f"Table {t_idx} exceeds maximum usable width: {total_width:.2f} in!"
        
    print("\nALL 6 VERIFICATION CRITERIA PASSED FLAWLESSLY!")

if __name__ == "__main__":
    verify()
