"""Test file manager.
"""

from unittest import TestCase
import logging
import os
import file_manager
import logs

class TestFileManager(TestCase):
    logger: logging.Logger

    RESOURCE_DIR = 'test/resources'
    TARGET_DIR = os.path.join(RESOURCE_DIR, 'target')

    F_1 = 'one-two three_four (1).xyz'
    """Original text file"""
    F_2 = 'one-two three_four (2).xyz'
    """Full copy"""
    F_3 = 'one-two three_four (3).xyz'
    """Different content"""
    F_4 = 'one-two three four (4).xyz'
    """Different name"""
    F_5 = 'one-two three_four (5).abc'
    """Different extension"""

    I_1 = 'apple.png'
    """Original apple image file."""
    I_2 = 'apple (1).png'
    """Full copy, parenthesis syntax."""
    I_3 = 'apple copy.png'
    """Full copy, macos syntax."""
    I_4 = 'apple.jpg'
    """Converted to jpeg format."""

    def setUpClass():
        logs.init_logging(logs_dir=os.path.join(TestFileManager.RESOURCE_DIR, 'logs'))
        TestFileManager.logger = logging.getLogger(TestFileManager.__name__)
        TestFileManager.logger.setLevel(logging.DEBUG)
    # end def

    def test_file_name_to_id_text(self):
        prev_dir = os.getcwd()
        os.chdir(self.TARGET_DIR)
        self.logger.debug(f'test target dir = {os.getcwd()}')

        # original
        id_1 = file_manager.file_name_to_id(self.F_1)
        # full copy
        id_2 = file_manager.file_name_to_id(self.F_2)
        # different content
        id_3 = file_manager.file_name_to_id(self.F_3)
        # different name
        id_4 = file_manager.file_name_to_id(self.F_4)
        # different extension
        id_5 = file_manager.file_name_to_id(self.F_5)

        self.assertEqual(id_1, id_2, f'failed to identify {id_2} as clone of {id_1}')
        self.assertNotEqual(id_1, id_3, f'failed to distinguish {id_3} by file contents')
        self.assertNotEqual(id_1, id_4, f'failed to distinguish {id_4} by file name')
        self.assertNotEqual(id_1, id_5, f'failed to distinguish {id_5} by file extension')

        os.chdir(prev_dir)
    # end def

    def test_file_name_to_id_image(self):
        self.skipTest('not ready')
    # end def

    def test_find_duplicate_files_shallow(self):
        index, duplicates = file_manager.find_duplicate_files(
            parent_dir=self.TARGET_DIR,
            res_dir=None,
            skip_file_write=True,
            recursive=False
        )
        index_values = []
        for index_value in index.values():
            index_values += index_value

        self.assertEqual(duplicates[0], self.F_2)
        for file_name in [self.F_1, self.F_2, self.F_3, self.F_4, self.F_5]:
            self.assertIn(file_name, index_values)
    # end def

    def test_find_duplicate_files_deep(self):
        index, duplicates = file_manager.find_duplicate_files(
            parent_dir=self.TARGET_DIR,
            res_dir=os.path.join(self.RESOURCE_DIR, 'res', 'find_duplicate_files_deep'),
            skip_file_write=False,
            recursive=True
        )
        self.skipTest('not done')
    # end def

    def test_delete_duplicate_files_shallow(self):
        self.skipTest('not ready')
    # end def

    def test_delete_duplicate_files_deep(self):
        self.skipTest('not ready')
    # end def

    def test_image_metadata(self):
        self.skipTest('not ready')
    # end def
# end class